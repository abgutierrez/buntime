import { describe, expect, test } from "bun:test";
import {
    evaluateHostAccess,
    parseConnectTarget,
    parseHttpRequestTarget,
} from "../proxy";

const encoder = new TextEncoder();
const decoder = new TextDecoder();

function concatChunks(chunks: Uint8Array[]): Uint8Array {
    const total = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
    const merged = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) {
        merged.set(chunk, offset);
        offset += chunk.length;
    }
    return merged;
}

function waitFor(predicate: () => boolean, timeoutMs = 1000): Promise<void> {
    return new Promise((resolve, reject) => {
        const start = Date.now();
        const tick = () => {
            if (predicate()) {
                resolve();
                return;
            }
            if (Date.now() - start > timeoutMs) {
                reject(new Error("Timed out waiting for condition"));
                return;
            }
            setTimeout(tick, 10);
        };
        tick();
    });
}

describe("proxy helpers", () => {
    test("evaluateHostAccess honors allow list", () => {
        const decision = evaluateHostAccess(
            "example.com",
            new Set(["example.com"]),
            new Set(),
        );
        expect(decision.allowed).toBe(true);
        expect(decision.isAllowed).toBe(true);
        expect(decision.isDenied).toBe(false);
    });

    test("evaluateHostAccess denies explicit block", () => {
        const decision = evaluateHostAccess(
            "example.com",
            new Set(["*"]),
            new Set(["example.com"]),
        );
        expect(decision.allowed).toBe(false);
        expect(decision.isDenied).toBe(true);
    });

    test("parseConnectTarget defaults port", () => {
        const parsed = parseConnectTarget("example.com");
        expect(parsed).not.toBeNull();
        expect(parsed?.hostname).toBe("example.com");
        expect(parsed?.port).toBe(443);
    });

    test("parseHttpRequestTarget parses absolute URL", () => {
        const requestLine = "GET http://example.com/test?q=1 HTTP/1.1";
        const lines = [requestLine, "Host: example.com"];
        const parsed = parseHttpRequestTarget(requestLine, lines);
        expect(parsed).not.toBeNull();
        expect(parsed?.hostname).toBe("example.com");
        expect(parsed?.port).toBe(80);
        expect(parsed?.requestLine).toBe("GET /test?q=1 HTTP/1.1");
    });

    test("parseHttpRequestTarget falls back to Host header", () => {
        const requestLine = "GET /path HTTP/1.1";
        const lines = [requestLine, "Host: example.com:8080"];
        const parsed = parseHttpRequestTarget(requestLine, lines);
        expect(parsed).not.toBeNull();
        expect(parsed?.hostname).toBe("example.com");
        expect(parsed?.port).toBe(8080);
    });
});

describe("proxy socket flows", () => {
    test("CONNECT forwards data for allowed host", async () => {
        const targetChunks: Uint8Array[] = [];
        const targetServer = Bun.listen({
            hostname: "127.0.0.1",
            port: 0,
            socket: {
                data(_socket, data) {
                    const chunk = data instanceof Uint8Array ? data : new Uint8Array(data as ArrayBuffer);
                    targetChunks.push(chunk);
                    _socket.write(encoder.encode("pong"));
                    _socket.end();
                },
            },
        });

        const proxy = new (await import("../proxy")).NetworkProxy(
            {
                security: { mode: "strict" },
                network: {
                    enabled: true,
                    policy: "allow_list",
                    allow_list: ["127.0.0.1"],
                    deny_list: [],
                    rate_limit: 5,
                },
                filesystem: { allow_write: false },
                resources: { memory_limit: 64, cpu_limit: 50 },
            },
            0,
        );

        proxy.start();
        const proxyServer = (proxy as unknown as { server?: { port: number } }).server;
        if (!proxyServer || proxyServer.port === 0) {
            throw new Error("Proxy server did not start");
        }
        const proxyPort = proxyServer.port;

        const responses: Uint8Array[] = [];
        const clientSocket = await Bun.connect({
            hostname: "127.0.0.1",
            port: proxyPort,
            socket: {
                data(_socket, data) {
                    const chunk = data instanceof Uint8Array ? data : new Uint8Array(data as ArrayBuffer);
                    responses.push(chunk);
                },
            },
        });

        try {
            const connectLine = `CONNECT 127.0.0.1:${targetServer.port} HTTP/1.1\r\nHost: 127.0.0.1:${targetServer.port}\r\n\r\n`;
            clientSocket.write(encoder.encode(connectLine));

            await waitFor(() => decoder.decode(concatChunks(responses)).includes("200 Connection Established"));

            clientSocket.write(encoder.encode("ping"));
            await waitFor(() => decoder.decode(concatChunks(responses)).includes("pong"));

            const targetPayload = decoder.decode(concatChunks(targetChunks));
            expect(targetPayload).toContain("ping");
        } finally {
            clientSocket.end();
            proxy.stop();
            targetServer.stop();
        }
    });

    test("CONNECT denies blocked host", async () => {
        const proxy = new (await import("../proxy")).NetworkProxy(
            {
                security: { mode: "strict" },
                network: {
                    enabled: true,
                    policy: "allow_list",
                    allow_list: ["example.com"],
                    deny_list: [],
                    rate_limit: 5,
                },
                filesystem: { allow_write: false },
                resources: { memory_limit: 64, cpu_limit: 50 },
            },
            0,
        );

        proxy.start();
        const proxyServer = (proxy as unknown as { server?: { port: number } }).server;
        if (!proxyServer || proxyServer.port === 0) {
            throw new Error("Proxy server did not start");
        }
        const proxyPort = proxyServer.port;

        const responses: Uint8Array[] = [];
        const clientSocket = await Bun.connect({
            hostname: "127.0.0.1",
            port: proxyPort,
            socket: {
                data(_socket, data) {
                    const chunk = data instanceof Uint8Array ? data : new Uint8Array(data as ArrayBuffer);
                    responses.push(chunk);
                },
            },
        });

        try {
            const connectLine = "CONNECT 127.0.0.1:443 HTTP/1.1\r\nHost: 127.0.0.1:443\r\n\r\n";
            clientSocket.write(encoder.encode(connectLine));

            await waitFor(() => decoder.decode(concatChunks(responses)).includes("403 Forbidden"));
        } finally {
            clientSocket.end();
            proxy.stop();
        }
    });

    test("HTTP request forwards and rewrites request line", async () => {
        let receivedRequestLine = "";
        const targetServer = Bun.listen({
            hostname: "127.0.0.1",
            port: 0,
            socket: {
                data(_socket, data) {
                    const chunk = data instanceof Uint8Array ? data : new Uint8Array(data as ArrayBuffer);
                    const text = decoder.decode(chunk);
                    receivedRequestLine = text.split("\r\n")[0] ?? "";
                    _socket.write(encoder.encode("HTTP/1.1 200 OK\r\nContent-Length: 5\r\n\r\nhello"));
                    _socket.end();
                },
            },
        });

        const proxy = new (await import("../proxy")).NetworkProxy(
            {
                security: { mode: "strict" },
                network: {
                    enabled: true,
                    policy: "allow_list",
                    allow_list: ["127.0.0.1"],
                    deny_list: [],
                    rate_limit: 5,
                },
                filesystem: { allow_write: false },
                resources: { memory_limit: 64, cpu_limit: 50 },
            },
            0,
        );

        proxy.start();
        const proxyServer = (proxy as unknown as { server?: { port: number } }).server;
        if (!proxyServer || proxyServer.port === 0) {
            throw new Error("Proxy server did not start");
        }
        const proxyPort = proxyServer.port;

        const responses: Uint8Array[] = [];
        const clientSocket = await Bun.connect({
            hostname: "127.0.0.1",
            port: proxyPort,
            socket: {
                data(_socket, data) {
                    const chunk = data instanceof Uint8Array ? data : new Uint8Array(data as ArrayBuffer);
                    responses.push(chunk);
                },
            },
        });

        try {
            const requestLine = `GET http://127.0.0.1:${targetServer.port}/path HTTP/1.1`;
            const request = `${requestLine}\r\nHost: 127.0.0.1:${targetServer.port}\r\n\r\n`;
            clientSocket.write(encoder.encode(request));

            await waitFor(() => decoder.decode(concatChunks(responses)).includes("hello"));
            expect(receivedRequestLine).toBe("GET /path HTTP/1.1");
        } finally {
            clientSocket.end();
            proxy.stop();
            targetServer.stop();
        }
    });
});
