import { PolicyLoader, type NormalizedPolicy, type Policy } from "./sandbox/policy/loader";
import { IPCServer } from "./ipc/server";
import { loadConfig } from "./config";
import indexHtml from "./public/index.html";
import { join } from "path";
import { EBPFAuditTelemetry, type AuditTelemetryEvent } from "./sandbox/telemetry/ebpf";
import { buildOpenPolicy, buildPolicySetMeta, mergePolicies, validatePolicySetInput, type PolicySetMeta, type PolicySetSource } from "./sandbox/policy/set";

console.log("[Main] Initializing Sandbox Environment...");

// --- Global State ---
const sockets = new Set<any>();
let activePolicy: NormalizedPolicy | null = null;
let activePolicySetMeta: PolicySetMeta | null = null;
let ipcServer: IPCServer | null = null;
let policyPath = process.env.POLICY_FILE || "src/policies/default.json";
const activePolicyPath = join(process.cwd(), "src/policies/active.json");
const activePolicyMetaPath = join(process.cwd(), "src/policies/active.meta.json");
const examplesDir = join(process.cwd(), "src/examples");
const syscallBuckets = ["connect", "openat", "execve"] as const;
const syscallHeatmapSize = 20;
let telemetry: EBPFAuditTelemetry | null = null;
const syscallCounts = new Map<string, number>();
let lastSyscallBroadcast = 0;
const auditEventQueue: AuditTelemetryEvent[] = [];
const maxAuditQueueSize = 200;
const maxAuditBatchSize = 40;
const auditBroadcastIntervalMs = 250;
let auditFlushTimer: ReturnType<typeof setInterval> | null = null;
const exampleCatalog = [
    {
        id: "hello_world",
        label: "Hello World",
        description: "Baseline output and environment info.",
        group: "Basics",
        file: "hello_world.py",
    },
    {
        id: "fs_allow_tmp",
        label: "FS Allow /tmp",
        description: "Allowed filesystem access under FS allowlist.",
        group: "Filesystem",
        file: "fs_allow_tmp.py",
    },
    {
        id: "fs_allow_etc",
        label: "FS Allow /etc",
        description: "Read /etc directory entries.",
        group: "Filesystem",
        file: "fs_allow_work.py",
    },
    {
        id: "fs_deny_etc",
        label: "FS Deny /etc/hosts",
        description: "Denied filesystem access outside allowlist.",
        group: "Filesystem",
        file: "fs_deny_etc.py",
    },
    {
        id: "fs_deny_etc_hostname",
        label: "FS Deny /etc/hostname",
        description: "Blocked read outside allowlist.",
        group: "Filesystem",
        file: "fs_deny_var_log.py",
    },
    {
        id: "net_rfc1918_block",
        label: "Net Deny RFC1918",
        description: "Blocked outbound access to private ranges.",
        group: "Network",
        file: "net_rfc1918_block.py",
    },
    {
        id: "net_allow_external",
        label: "Net Allow External",
        description: "Outbound HTTPS to public endpoint.",
        group: "Network",
        file: "net_allow_external.py",
    },
    {
        id: "net_warn_db_ports",
        label: "Net Warn DB Ports",
        description: "Connection attempt to DB ports.",
        group: "Network",
        file: "net_warn_db_ports.py",
    },
    {
        id: "net_warn_ssh",
        label: "Net Warn SSH",
        description: "Connection attempt to SSH port.",
        group: "Network",
        file: "net_warn_ssh.py",
    },
    {
        id: "net_warn_mysql",
        label: "Net Warn MySQL",
        description: "Connection attempt to MySQL port.",
        group: "Network",
        file: "net_warn_mysql.py",
    },
    {
        id: "exec_allow_python",
        label: "Exec Allow Python",
        description: "Allowed exec for Python interpreter.",
        group: "Execution",
        file: "exec_allow_python.py",
    },
    {
        id: "exec_deny_shell",
        label: "Exec Deny /bin/sh",
        description: "Denied exec for /bin/sh.",
        group: "Execution",
        file: "exec_deny_shell.py",
    },
    {
        id: "exec_deny_cat",
        label: "Exec Deny /bin/cat",
        description: "Denied exec for /bin/cat.",
        group: "Execution",
        file: "exec_deny_cat.py",
    },
    {
        id: "exec_deny_ls",
        label: "Exec Deny /bin/ls",
        description: "Denied exec for /bin/ls.",
        group: "Execution",
        file: "exec_deny_ls.py",
    },
    {
        id: "exec_deny_curl",
        label: "Exec Deny /usr/bin/curl",
        description: "Denied exec for curl.",
        group: "Execution",
        file: "exec_deny_curl.py",
    },
    {
        id: "exec_deny_bun",
        label: "Exec Deny bun",
        description: "Denied exec for bun.",
        group: "Execution",
        file: "exec_deny_bun.py",
    },
    {
        id: "exec_deny_bash",
        label: "Exec Deny /bin/bash",
        description: "Denied exec for /bin/bash.",
        group: "Execution",
        file: "exec_deny_bash.py",
    },
];

async function loadPolicy(path: string, meta?: PolicySetMeta | null) {
    const loader = new PolicyLoader();
    activePolicy = await loader.load(path);
    console.log("[Main] Policy loaded and normalized successfully.");
    if (activePolicy?.audit?.enabled) {
        console.log(`[Audit] Enabled events: ${(activePolicy.audit.events || []).join(", ")}`);
    }
    await configureTelemetry(activePolicy);
    if (meta) {
        activePolicySetMeta = meta;
    }
    broadcast({ type: "policy-loaded", data: activePolicy });
    if (activePolicySetMeta) {
        broadcast({ type: "policy-set-loaded", data: activePolicySetMeta });
    }
}

function buildHeatmapPayload() {
    const counts: number[] = new Array(syscallHeatmapSize).fill(0);
    const buckets: string[] = new Array(syscallHeatmapSize).fill("");
    syscallBuckets.forEach((name, index) => {
        counts[index] = syscallCounts.get(name) || 0;
        buckets[index] = name;
    });
    return { buckets, counts };
}

function onTelemetryEvent(event: AuditTelemetryEvent) {
    const prev = syscallCounts.get(event.syscall) || 0;
    syscallCounts.set(event.syscall, prev + 1);
    const now = Date.now();
    if (now - lastSyscallBroadcast > 200) {
        lastSyscallBroadcast = now;
        broadcast({ type: "syscalls", data: buildHeatmapPayload() });
    }

    if (auditEventQueue.length >= maxAuditQueueSize) {
        auditEventQueue.shift();
    }
    auditEventQueue.push(event);
}

function flushAuditEvents() {
    if (!auditEventQueue.length || sockets.size === 0) return;
    const batch = auditEventQueue.splice(0, maxAuditBatchSize);
    broadcast({ type: "audit-events", data: batch });
}

function startAuditFlushLoop() {
    if (auditFlushTimer) return;
    auditFlushTimer = setInterval(flushAuditEvents, auditBroadcastIntervalMs);
}

function stopAuditFlushLoop() {
    if (!auditFlushTimer) return;
    clearInterval(auditFlushTimer);
    auditFlushTimer = null;
}

async function configureTelemetry(policy: NormalizedPolicy | null) {
    if (!policy?.audit?.enabled) {
        telemetry?.stop();
        stopAuditFlushLoop();
        return;
    }
    const events = (policy.audit.events || []).filter((event) =>
        syscallBuckets.includes(event as (typeof syscallBuckets)[number]),
    ) as (typeof syscallBuckets)[number][];

    if (!events.length) {
        telemetry?.stop();
        stopAuditFlushLoop();
        return;
    }

    if (!telemetry) {
        telemetry = new EBPFAuditTelemetry();
        telemetry.onEvent(onTelemetryEvent);
    } else {
        telemetry.stop();
    }
    await telemetry.start(events);
    startAuditFlushLoop();
}

async function loadPolicySetMetaIfPresent() {
    const file = Bun.file(activePolicyMetaPath);
    if (!await file.exists()) return null;
    try {
        const meta = await file.json() as PolicySetMeta;
        activePolicySetMeta = meta;
        if (activePolicySetMeta) {
            broadcast({ type: "policy-set-loaded", data: activePolicySetMeta });
        }
        return meta;
    } catch (error) {
        console.warn(`[Main] Failed to load policy metadata: ${error}`);
        return null;
    }
}

async function applyPolicySet(
    payload: { policies?: Policy[]; policy?: Policy; policyKeys?: string[] },
    source: PolicySetSource,
): Promise<PolicySetMeta> {
    const policyList = Array.isArray(payload.policies)
        ? payload.policies
        : payload.policy
            ? [payload.policy]
            : [];

    const validation = validatePolicySetInput(policyList, payload.policyKeys);
    if (!validation.ok) {
        throw new Error(validation.errors.join(" "));
    }

    let combinedPolicy: Policy;
    if (policyList.length === 0) {
        combinedPolicy = buildOpenPolicy();
    } else {
        const loader = new PolicyLoader();
        for (const policy of policyList) {
            loader.validatePolicy(policy);
        }
        combinedPolicy = mergePolicies(policyList);
    }
    const meta = buildPolicySetMeta(policyList, payload.policyKeys, combinedPolicy, source);

    await Bun.write(activePolicyPath, JSON.stringify(combinedPolicy, null, 2));
    await Bun.write(activePolicyMetaPath, JSON.stringify(meta, null, 2));
    policyPath = activePolicyPath;
    await loadPolicy(policyPath, meta);
    return meta;
}

// --- Main Execution Logic ---
async function initialize() {
    // Load Configuration
    const config = await loadConfig();
    console.log(`[Main] Configuration loaded: ${config.security.mode} mode, Network: ${config.network.enabled ? "Enabled" : "Disabled"}`);
    if (config.network.enabled && config.network.policy === "allow_list") {
        console.log(`[Main] Allowed Domains: ${config.network.allow_list.join(", ")}`);
    }

    console.log(`[Main] Loading policy from: ${policyPath}`);

    try {
        await loadPolicy(policyPath);
    } catch (error: any) {
        console.error(`[Main] Failed to initialize policy: ${error.message}`);
        // We continue even if policy fails for dev mode, but strictly we should stop.
    }

    await loadPolicySetMetaIfPresent();

    // Initialize IPC Server (Platform Independent logic for now to support dev)
    try {
        const shmName = "/bun_ipc_" + Math.random().toString(36).slice(2, 8); // Short name < 31 chars
        ipcServer = new IPCServer(shmName, 1024 * 1024, (data) => {
             const text = new TextDecoder().decode(data);
             broadcast({ type: "output", data: text });
        });

        ipcServer.setOnStateChange((state, signal) => {
            if (signal === "WORKER_EVENT" && state === "exec_start") {
                syscallCounts.clear();
                auditEventQueue.length = 0;
                lastSyscallBroadcast = 0;
                broadcast({ type: "syscalls", data: buildHeatmapPayload() });
                broadcast({ type: "audit-reset" });
            }
            broadcast({ type: "state", data: { python: state, signal: signal } });
        });

        const scriptPath = join(process.cwd(), "src/worker.py");
        console.log(`[Main] Starting IPC Server with script: ${scriptPath}`);
        
        await ipcServer.start(scriptPath, config);

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
    async fetch(req, server) {
        if (server.upgrade(req)) {
            return;
        }
        const url = new URL(req.url);
        if (url.pathname === "/examples") {
            return new Response(JSON.stringify(exampleCatalog), {
                headers: { "content-type": "application/json" },
            });
        }
        if (url.pathname.startsWith("/examples/")) {
            const id = decodeURIComponent(url.pathname.replace("/examples/", ""));
            const entry = exampleCatalog.find((example) => example.id === id);
            if (!entry) {
                return new Response("Not found", { status: 404 });
            }
            const filePath = join(examplesDir, entry.file);
            const file = Bun.file(filePath);
            if (!await file.exists()) {
                return new Response("Not found", { status: 404 });
            }
            return new Response(file, {
                headers: { "content-type": "text/plain; charset=utf-8" },
            });
        }
        return new Response("Not found", { status: 404 });
    },
    websocket: {
        open(ws) {
            console.log("[WS] Client connected.");
            sockets.add(ws);
            ws.send(JSON.stringify({ type: "policy-loaded", data: activePolicy }));
            if (activePolicySetMeta) {
                ws.send(JSON.stringify({ type: "policy-set-loaded", data: activePolicySetMeta }));
            }
            if (ipcServer) {
                // Send initial state
                ws.send(JSON.stringify({ type: "state", data: { bun: "Ready" } }));
            }
        },
        async message(ws, message) {
            const msgStr = typeof message === "string" ? message : new TextDecoder().decode(message);

            if (msgStr === "STOP") {
                if (ipcServer) ipcServer.interrupt();
                return;
            }

            let payload: any = null;
            try {
                payload = JSON.parse(msgStr);
            } catch {}

            if (payload?.type === "apply-policy") {
            try {
                await applyPolicySet(payload, "apply");
                ws.send(JSON.stringify({ type: "state", data: { bun: "Policy Applied" } }));
                } catch (error: any) {
                    ws.send(JSON.stringify({ type: "error", data: `Policy apply failed: ${error.message}` }));
                }
                return;
            }

            const code = payload?.type === "run" ? payload.code : msgStr;
            if (payload?.type === "run" && (payload.policies || payload.policy)) {
                try {
                    await applyPolicySet(payload, "run");
                } catch (error: any) {
                    ws.send(JSON.stringify({ type: "error", data: `Policy apply failed: ${error.message}` }));
                    return;
                }
            }

            if (ipcServer) {
                const bytes = new TextEncoder().encode(code || "");
                if (ipcServer.send(bytes)) {
                    ws.send(JSON.stringify({ type: "state", data: { bun: "Sending..." } }));
                    setTimeout(() => {
                         ws.send(JSON.stringify({ type: "state", data: { bun: "Sent" } }));
                    }, 200);
                } else {
                    ws.send(JSON.stringify({ type: "error", data: "Ring buffer full" }));
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
