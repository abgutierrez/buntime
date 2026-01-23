import { SandboxConfig } from "./config";

export class NetworkProxy {
    private config: SandboxConfig;
    private server: any;
    private port: number;

    constructor(config: SandboxConfig, port: number = 8080) {
        this.config = config;
        this.port = port;
    }

    start() {
        const allowed = new Set(this.config.network.allow_list);
        const denied = new Set(this.config.network.deny_list ?? []);
        console.log(`[Proxy] Starting TCP Proxy on port ${this.port}`);

        const encoder = new TextEncoder();
        const decoder = new TextDecoder();
        const concatBytes = (a: Uint8Array, b: Uint8Array) => {
            const merged = new Uint8Array(a.length + b.length);
            merged.set(a, 0);
            merged.set(b, a.length);
            return merged;
        };
        const headerTerminator = encoder.encode("\r\n\r\n");
        const findHeaderEnd = (data: Uint8Array) => {
            for (let i = 0; i <= data.length - headerTerminator.length; i += 1) {
                let match = true;
                for (let j = 0; j < headerTerminator.length; j += 1) {
                    if (data[i + j] !== headerTerminator[j]) {
                        match = false;
                        break;
                    }
                }
                if (match) return i + headerTerminator.length;
            }
            return -1;
        };

        this.server = Bun.listen({
            hostname: "0.0.0.0",
            port: this.port,
            socket: {
                data(socket, data) {
                    const s = socket as any;
                    
                    if (s.remoteSocket) {
                        try {
                            s.remoteSocket.write(data);
                        } catch (e) {
                            socket.end();
                        }
                        return;
                    }

                    const chunk = data instanceof Uint8Array ? data : new Uint8Array(data as ArrayBuffer);
                    s.buffer = s.buffer ? concatBytes(s.buffer, chunk) : chunk;

                    const headerEnd = findHeaderEnd(s.buffer);
                    if (headerEnd === -1) {
                        return;
                    }

                    const headerBytes = s.buffer.slice(0, headerEnd);
                    const rest = s.buffer.slice(headerEnd);
                    s.buffer = null;

                    const headerText = decoder.decode(headerBytes);
                    const lines = headerText.split("\r\n");
                    const requestLine = lines[0] || "";

                    if (requestLine.startsWith("CONNECT ")) {
                        const parts = requestLine.split(" ");
                        const target = parts[1] || "";
                        const [rawHost, rawPort] = target.split(":");
                        const hostname = rawHost ?? "";
                        const port = parseInt(rawPort ?? "") || 443;

                        console.log(`[Proxy] CONNECT ${hostname}:${port}`);

                        const isDenied = denied.has("*") || denied.has(hostname) || denied.has("www." + (hostname || ""));
                        const isAllowed = allowed.has("*") || allowed.has(hostname) || allowed.has("www." + (hostname || ""));
                        if (isDenied || !isAllowed) {
                            console.warn(`[Proxy] BLOCKED: ${hostname}`);
                            socket.write("HTTP/1.1 403 Forbidden\r\n\r\n");
                            socket.end();
                            return;
                        }

                        Bun.connect({
                            hostname: hostname || "localhost",
                            port: port || 443,
                            socket: {
                                data(remoteSocket, remoteData) {
                                    try {
                                        socket.write(remoteData);
                                    } catch (e) {
                                        remoteSocket.end();
                                    }
                                },
                                close() {
                                    socket.end();
                                },
                                error(e) {
                                    console.error(`[Proxy] Remote Error (${hostname}): ${e}`);
                                    socket.end();
                                }
                            }
                        }).then(remoteSocket => {
                            s.remoteSocket = remoteSocket;
                            socket.write("HTTP/1.1 200 Connection Established\r\n\r\n");
                            if (rest.length > 0) {
                                remoteSocket.write(rest);
                            }
                            console.log(`[Proxy] Tunnel established to ${hostname}`);
                        }).catch(e => {
                            console.error(`[Proxy] Upstream Connect Failed: ${e}`);
                            socket.write("HTTP/1.1 502 Bad Gateway\r\n\r\n");
                            socket.end();
                        });
                        return;
                    }

                    const requestParts = requestLine.split(" ");
                    const method = requestParts[0] || "";
                    const target = requestParts[1] || "";
                    const version = requestParts[2] || "HTTP/1.1";

                    let hostname = "";
                    let port = 80;
                    let newRequestLine = requestLine;

                    if (target.startsWith("http://")) {
                        try {
                            const url = new URL(target);
                            hostname = url.hostname;
                            port = parseInt(url.port) || 80;
                            const path = `${url.pathname || "/"}${url.search || ""}`;
                            newRequestLine = `${method} ${path} ${version}`;
                        } catch (e) {
                            console.warn(`[Proxy] Invalid URL in HTTP request: ${target}`);
                        }
                    }

                    if (!hostname) {
                        const hostHeader = lines.find((line) => line.toLowerCase().startsWith("host:"));
                        if (hostHeader) {
                            const hostValue = hostHeader.split(":")[1]?.trim() ?? "";
                            const [headerHost, headerPort] = hostValue.split(":");
                            hostname = headerHost ?? "";
                            port = parseInt(headerPort ?? "") || 80;
                        }
                    }

                    if (!hostname) {
                        socket.write("HTTP/1.1 400 Bad Request\r\n\r\n");
                        socket.end();
                        return;
                    }

                    console.log(`[Proxy] HTTP Request: ${hostname}`);

                    const isDenied = denied.has("*") || denied.has(hostname) || denied.has("www." + hostname);
                    const isAllowed = allowed.has("*") || allowed.has(hostname) || allowed.has("www." + hostname);
                    if (isDenied || !isAllowed) {
                        console.warn(`[Proxy] BLOCKED: ${hostname}`);
                        socket.write("HTTP/1.1 403 Forbidden\r\nContent-Length: 19\r\n\r\nProxy Access Denied");
                        socket.end();
                        return;
                    }

                    const headerLines = [newRequestLine, ...lines.slice(1)];
                    const rebuiltHeaders = `${headerLines.join("\r\n")}\r\n\r\n`;
                    const forwardHeader = encoder.encode(rebuiltHeaders);
                    const forwardData = rest.length > 0 ? concatBytes(forwardHeader, rest) : forwardHeader;

                    Bun.connect({
                        hostname: hostname || "localhost",
                        port: port || 80,
                        socket: {
                            data(remoteSocket, remoteData) {
                                try {
                                    socket.write(remoteData);
                                } catch (e) {
                                    remoteSocket.end();
                                }
                            },
                            close() { socket.end(); },
                            error(e) { socket.end(); }
                        }
                    }).then(remoteSocket => {
                        s.remoteSocket = remoteSocket;
                        remoteSocket.write(forwardData);
                    }).catch(e => {
                        socket.write("HTTP/1.1 502 Bad Gateway\r\n\r\n");
                        socket.end();
                    });
                },
                error(socket, error) {
                    console.error(`[Proxy] Socket error: ${error}`);
                }
            }
        });
    }

    stop() {
        if (this.server) this.server.stop();
    }
}
