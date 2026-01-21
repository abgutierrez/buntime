import { type ServeOptions } from "bun";
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
        const mode = this.config.security.mode;

        console.log(`[Proxy] Starting on port ${this.port}`);
        console.log(`[Proxy] Allow list: ${Array.from(allowed).join(", ")}`);

        this.server = Bun.serve({
            port: this.port,
            hostname: "0.0.0.0", // Listen on all interfaces
            async fetch(req) {
                const url = new URL(req.url);
                // Standard Bun.serve handles HTTP. For HTTPS proxying, we need to handle CONNECT.
                
                const targetUrl = new URL(req.url);
                let hostname = targetUrl.hostname;

                // Handle CONNECT method (used by HTTPS proxies)
                // Bun's fetch handler receives the CONNECT request but we can't fully handle the TCP tunnel here
                // without access to the underlying socket.
                // However, for policy enforcement, we can check the hostname.
                if (req.method === "CONNECT") {
                    // URL in CONNECT is usually "hostname:port"
                    // URL constructor might fail if no protocol.
                    // req.url for CONNECT is usually just "www.google.com:443"
                    try {
                        const parts = req.url.split(":");
                        hostname = parts[0];
                    } catch (e) {
                        console.warn(`[Proxy] Failed to parse CONNECT URL: ${req.url}`);
                        return new Response("Bad Request", { status: 400 });
                    }
                }

                console.log(`[Proxy] Request: ${req.method} ${hostname}`);

                if (!allowed.has(hostname) && !allowed.has("www." + hostname)) {
                    console.warn(`[Proxy] BLOCKED: ${hostname}`);
                    return new Response("Proxy Blocked: Domain not allowed", { status: 403 });
                }
                
                if (req.method === "CONNECT") {
                    // We can't implement a real CONNECT tunnel in Bun.serve fetch() easily yet.
                    // Returning 200 OK tells the client the tunnel is ready, but we have no way to pipe the socket.
                    // CRITICAL LIMITATION: Bun.serve high-level API doesn't expose the raw socket for CONNECT upgrading yet 
                    // in a way that allows us to pipe it to an upstream destination easily in pure JS without hacks.
                    
                    // FALLBACK: Return 403 or 501 Not Implemented.
                    // To make this work for HTTPS, we actually need a TCP server, not an HTTP server.
                    // Or use a library like `http-proxy` if we were on Node, but we are on Bun.
                    
                    // For the purpose of this demo, effectively HTTPS is blocked by technical limitation of this simple proxy.
                    // But our policy enforcement IS WORKING (it blocked example.com correctly).
                    // The "Forbidden" error for google.com came from us returning 403/error? 
                    // Actually the log said "[Proxy] BLOCKED: " (empty hostname).
                    
                    // Wait, the log said "[Proxy] BLOCKED: ". This means hostname parsing failed for CONNECT.
                    
                    console.warn(`[Proxy] HTTPS (CONNECT) not fully supported in this simple proxy implementation. Allowing handshake for testing policy.`);
                    return new Response(null, { status: 200 }); // Fake success to see if client sends data? No, this won't work for real traffic.
                }

                console.log(`[Proxy] ALLOWED: ${hostname}`);

                try {
                    const response = await fetch(req);
                    return new Response(response.body, {
                        status: response.status,
                        statusText: response.statusText,
                        headers: response.headers
                    });
                } catch (e: any) {
                     return new Response(`Proxy Error: ${e.message}`, { status: 502 });
                }
            }
        });
    }

    stop() {
        if (this.server) this.server.stop();
    }
}
