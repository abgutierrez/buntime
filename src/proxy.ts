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
                const hostname = targetUrl.hostname;

                console.log(`[Proxy] Request: ${req.method} ${hostname}`);

                if (!allowed.has(hostname) && !allowed.has("www." + hostname)) {
                    console.warn(`[Proxy] BLOCKED: ${hostname}`);
                    return new Response("Proxy Blocked: Domain not allowed", { status: 403 });
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
