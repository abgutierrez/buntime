import { PolicyLoader, type NormalizedPolicy } from "./sandbox/policy/loader";
import { SandboxLauncher } from "./sandbox/launcher";
import { IPCServer } from "./ipc/server";
import { loadConfig } from "./config";
import indexHtml from "./public/index.html";
import { join } from "path";

console.log("[Main] Initializing Sandbox Environment...");

// --- Global State ---
const WS_OPEN = 1;
const sockets = new Set<any>();
let activePolicy: NormalizedPolicy | null = null;
let ipcServer: IPCServer | null = null;

// --- Main Execution Logic ---
async function initialize() {
    // Load Configuration
    const config = await loadConfig();
    console.log(`[Main] Configuration loaded: ${config.security.mode} mode, Network: ${config.network.enabled ? "Enabled" : "Disabled"}`);
    if (config.network.enabled && config.network.policy === "allow_list") {
        console.log(`[Main] Allowed Domains: ${config.network.allow_list.join(", ")}`);
    }

    const policyPath = process.env.POLICY_FILE || "src/policies/default.json";
    console.log(`[Main] Loading policy from: ${policyPath}`);

    try {
        const loader = new PolicyLoader();
        activePolicy = await loader.load(policyPath);
        console.log("[Main] Policy loaded and normalized successfully.");
    } catch (error: any) {
        console.error(`[Main] Failed to initialize policy: ${error.message}`);
        // We continue even if policy fails for dev mode, but strictly we should stop.
    }

    // Initialize IPC Server (Platform Independent logic for now to support dev)
    try {
        const shmName = "/bun_ipc_" + Math.random().toString(36).slice(2, 8); // Short name < 31 chars
        ipcServer = new IPCServer(shmName, 1024 * 1024, (data) => {
             const text = new TextDecoder().decode(data);
             broadcast({ type: "output", data: text });
        });

        ipcServer.setOnStateChange((state, signal) => {
            broadcast({ type: "state", data: { python: state, signal: signal } });
        });

        const scriptPath = join(process.cwd(), "src/worker.py");
        console.log(`[Main] Starting IPC Server with script: ${scriptPath}`);
        
        await ipcServer.start(scriptPath);

        // Start stats loop
        setInterval(() => {
            if (ipcServer) {
                const mem = ipcServer.getMemoryState();
                broadcast({ type: "memory", data: mem });
            }
        }, 100);

    } catch (e: any) {
        console.error(`[Main] IPC Server failed to start: ${e.message}`);
        if (e.message.includes("libshm")) {
            console.error("[Main] Ensure libshm.so is compiled (gcc -shared -o libshm.so -fPIC src/shm.c)");
        }
    }
}

function broadcast(msg: any) {
    const json = JSON.stringify(msg);
    for (const ws of sockets) {
        ws.send(json);
    }
}

// --- Web Server for UI ---
Bun.serve({
    port: process.env.PORT || 3000,
    routes: {
        "/": indexHtml,
    },
    fetch(req, server) {
        if (server.upgrade(req)) {
            return;
        }
        return new Response("Not found", { status: 404 });
    },
    websocket: {
        open(ws) {
            console.log("[WS] Client connected.");
            sockets.add(ws);
            ws.send(JSON.stringify({ type: "policy-loaded", data: activePolicy }));
            if (ipcServer) {
                // Send initial state
                ws.send(JSON.stringify({ type: "state", data: { bun: "Ready" } }));
            }
        },
        message(ws, message) {
            const msgStr = typeof message === "string" ? message : new TextDecoder().decode(message);
            
            if (msgStr === "STOP") {
                if (ipcServer) ipcServer.interrupt();
            } else {
                if (ipcServer) {
                    const bytes = new TextEncoder().encode(msgStr);
                    if (ipcServer.send(bytes)) {
                        ws.send(JSON.stringify({ type: "state", data: { bun: "Sending..." } }));
                        setTimeout(() => {
                             ws.send(JSON.stringify({ type: "state", data: { bun: "Sent" } }));
                        }, 200);
                    } else {
                        ws.send(JSON.stringify({ type: "error", data: "Ring buffer full" }));
                    }
                }
            }
        },
        close(ws) {
            console.log("[WS] Client disconnected.");
            sockets.delete(ws);
        }
    }
});

console.log("[Main] Web Server listening on http://localhost:3000");

// --- Initialize ---
initialize();

process.on("SIGINT", () => {
    console.log("\n[Main] Shutting down...");
    if (ipcServer) ipcServer.stop();
    process.exit(0);
});
