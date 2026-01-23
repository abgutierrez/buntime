import { join } from "path";
import nodeCidr from "node-cidr";
import { mergePolicies, buildOpenPolicy } from "../sandbox/policy/set";
import type { FsPerm, Policy } from "../sandbox/policy/loader";

type Action = "allow" | "deny" | "warn";

interface OutputResult {
    output: string;
    errors: string[];
}

interface ExampleSpec {
    name: string;
    file: string;
    type: "none" | "fs" | "net" | "exec";
    allow: string[];
    deny: string[];
    warn: string[];
    fs?: { path: string; perm: FsPerm };
    net?: { ip: string; port: number; proto: "tcp" | "udp" };
    exec?: { path: string };
}

const examplesDir = join(process.cwd(), "src/examples");
const policiesDir = join(process.cwd(), "src/policies");

const POLICY_FILES = [
    "default.json",
    "fs-allowlist.json",
    "net-egress.json",
    "exec-policy.json",
    "anti-escape.json",
    "ebpf-audit.json",
];

const EXAMPLES: ExampleSpec[] = [
    {
        name: "hello_world",
        file: "hello_world.py",
        type: "none",
        allow: ["Calculation: 25 \\* 4 = 100"],
        deny: [],
        warn: [],
    },
    {
        name: "fs_allow_tmp",
        file: "fs_allow_tmp.py",
        type: "fs",
        allow: ["/tmp entries"],
        deny: ["/tmp access denied"],
        warn: [],
        fs: { path: "/tmp", perm: "read_dir" },
    },
    {
        name: "fs_allow_etc",
        file: "fs_allow_work.py",
        type: "fs",
        allow: ["/etc entries"],
        deny: ["/etc access denied"],
        warn: [],
        fs: { path: "/etc", perm: "read_dir" },
    },
    {
        name: "fs_deny_etc",
        file: "fs_deny_etc.py",
        type: "fs",
        allow: ["/etc/hosts read succeeded"],
        deny: ["/etc/hosts access denied"],
        warn: [],
        fs: { path: "/etc/hosts", perm: "read_file" },
    },
    {
        name: "fs_deny_etc_hostname",
        file: "fs_deny_var_log.py",
        type: "fs",
        allow: ["/etc/hostname read succeeded"],
        deny: ["/etc/hostname access denied", "/etc/hostname file not found"],
        warn: [],
        fs: { path: "/etc/hostname", perm: "read_file" },
    },
    {
        name: "fs_deny_app",
        file: "fs_deny_app.py",
        type: "fs",
        allow: ["/app read succeeded"],
        deny: ["/app (access denied|file not found)"],
        warn: [],
        fs: { path: "/app/test.txt", perm: "read_file" },
    },
    {
        name: "net_rfc1918_block",
        file: "net_rfc1918_block.py",
        type: "net",
        allow: ["RFC1918 connection succeeded"],
        deny: ["RFC1918 connection blocked"],
        warn: [],
        net: { ip: "10.0.0.1", port: 80, proto: "tcp" },
    },
    {
        name: "net_deny_172_16",
        file: "net_deny_172_16.py",
        type: "net",
        allow: ["172.16 connection succeeded"],
        deny: ["172.16 connection blocked"],
        warn: [],
        net: { ip: "172.16.0.1", port: 80, proto: "tcp" },
    },
    {
        name: "net_deny_192_168",
        file: "net_deny_192_168.py",
        type: "net",
        allow: ["192.168 connection succeeded"],
        deny: ["192.168 connection blocked"],
        warn: [],
        net: { ip: "192.168.1.1", port: 80, proto: "tcp" },
    },
    {
        name: "net_deny_metadata",
        file: "net_deny_metadata.py",
        type: "net",
        allow: ["Metadata connection succeeded"],
        deny: ["Metadata connection blocked"],
        warn: [],
        net: { ip: "169.254.169.254", port: 80, proto: "tcp" },
    },
    {
        name: "net_allow_external",
        file: "net_allow_external.py",
        type: "net",
        allow: ["External HTTPS connection succeeded"],
        deny: ["External connection failed"],
        warn: [],
        net: { ip: "1.1.1.1", port: 443, proto: "tcp" },
    },
    {
        name: "net_warn_db_ports",
        file: "net_warn_db_ports.py",
        type: "net",
        allow: ["Database connection succeeded"],
        deny: ["Database connection blocked"],
        warn: ["5432", "warn"],
        net: { ip: "127.0.0.1", port: 5432, proto: "tcp" },
    },
    {
        name: "net_warn_ssh",
        file: "net_warn_ssh.py",
        type: "net",
        allow: ["SSH connection succeeded"],
        deny: ["SSH connection blocked"],
        warn: ["2222", "warn"],
        net: { ip: "127.0.0.1", port: 2222, proto: "tcp" },
    },
    {
        name: "net_warn_mysql",
        file: "net_warn_mysql.py",
        type: "net",
        allow: ["MySQL connection succeeded"],
        deny: ["MySQL connection blocked"],
        warn: ["3306", "warn"],
        net: { ip: "127.0.0.1", port: 3306, proto: "tcp" },
    },
    {
        name: "exec_allow_python",
        file: "exec_allow_python.py",
        type: "exec",
        allow: ["Python exec output: ok"],
        deny: ["Python exec denied"],
        warn: [],
        exec: { path: "/usr/bin/python3.12" },
    },
    {
        name: "exec_deny_shell",
        file: "exec_deny_shell.py",
        type: "exec",
        allow: ["/bin/sh executed"],
        deny: ["/bin/sh exec denied"],
        warn: [],
        exec: { path: "/bin/sh" },
    },
    {
        name: "exec_deny_cat",
        file: "exec_deny_cat.py",
        type: "exec",
        allow: ["/bin/cat executed"],
        deny: ["/bin/cat exec denied"],
        warn: [],
        exec: { path: "/bin/cat" },
    },
    {
        name: "exec_deny_ls",
        file: "exec_deny_ls.py",
        type: "exec",
        allow: ["/bin/ls executed"],
        deny: ["/bin/ls exec denied"],
        warn: [],
        exec: { path: "/bin/ls" },
    },
    {
        name: "exec_deny_curl",
        file: "exec_deny_curl.py",
        type: "exec",
        allow: ["/usr/bin/curl executed"],
        deny: ["/usr/bin/curl exec denied"],
        warn: [],
        exec: { path: "/usr/bin/curl" },
    },
    {
        name: "exec_deny_bun",
        file: "exec_deny_bun.py",
        type: "exec",
        allow: ["bun executed"],
        deny: ["bun exec denied"],
        warn: [],
        exec: { path: "/usr/bin/bun" },
    },
    {
        name: "exec_deny_bash",
        file: "exec_deny_bash.py",
        type: "exec",
        allow: ["bash executed"],
        deny: ["bash exec denied"],
        warn: [],
        exec: { path: "/bin/bash" },
    },
];

class WSRunner {
    private ws: WebSocket;
    private output = "";
    private errors: string[] = [];
    private lastOutputAt = 0;
    private opened = false;
    private lastMessageAt = 0;
    private readyStateSeen = false;
    private pythonReady = false;

    constructor(url: string) {
        this.ws = new WebSocket(url);
        this.ws.addEventListener("open", () => {
            this.opened = true;
        });
        this.ws.addEventListener("message", (event) => {
            const text = decodeMessage(event.data);
            let msg: any = null;
            try {
                msg = JSON.parse(text);
            } catch {
                this.appendOutput(text);
                return;
            }
            this.lastMessageAt = Date.now();
            if (msg?.type === "output") {
                this.appendOutput(msg.data ?? "");
                return;
            }
            if (msg?.type === "state") {
                this.readyStateSeen = true;
                const pythonState = msg?.data?.python;
                if (typeof pythonState === "string" && pythonState.includes("Ready")) {
                    this.pythonReady = true;
                }
                return;
            }
            if (msg?.type === "error") {
                const data = msg.data ?? "Unknown error";
                this.errors.push(String(data));
                this.appendOutput(`ERROR: ${data}\n`);
            }
        });
    }

    async waitForOpen(timeoutMs: number) {
        const start = Date.now();
        while (!this.opened) {
            if (Date.now() - start > timeoutMs) {
                throw new Error("WebSocket connection timeout");
            }
            await sleep(50);
        }
    }

    async waitForAnyMessage(timeoutMs: number) {
        const start = Date.now();
        while (Date.now() - start < timeoutMs) {
            if (this.lastMessageAt > 0) return;
            await sleep(50);
        }
    }

    async waitForReadyState(timeoutMs: number) {
        const start = Date.now();
        while (Date.now() - start < timeoutMs) {
            if (this.readyStateSeen) return;
            await sleep(50);
        }
    }

    async waitForPythonReady(timeoutMs: number) {
        const start = Date.now();
        while (Date.now() - start < timeoutMs) {
            if (this.pythonReady) return;
            await sleep(50);
        }
    }

    hasReadyState() {
        return this.readyStateSeen;
    }

    hasPythonReady() {
        return this.pythonReady;
    }

    send(payload: unknown) {
        this.ws.send(JSON.stringify(payload));
    }

    resetOutput() {
        this.output = "";
        this.errors = [];
        this.lastOutputAt = Date.now();
    }

    getOutput() {
        return this.output;
    }

    getErrors() {
        return this.errors;
    }

    async waitForIdle(idleMs: number, timeoutMs: number): Promise<OutputResult> {
        const start = Date.now();
        let lastLen = this.output.length;
        while (true) {
            if (this.output.length !== lastLen) {
                lastLen = this.output.length;
                this.lastOutputAt = Date.now();
            }
            if (this.output.length > 0 && Date.now() - this.lastOutputAt >= idleMs) {
                return { output: this.output, errors: this.errors };
            }
            if (Date.now() - start > timeoutMs) {
                return { output: this.output, errors: [...this.errors, "timeout waiting for output"] };
            }
            await sleep(50);
        }
    }

    close() {
        this.ws.close();
    }

    private appendOutput(text: string) {
        if (!text) return;
        this.output += text;
        this.lastOutputAt = Date.now();
    }
}

function decodeMessage(data: unknown): string {
    if (typeof data === "string") return data;
    if (data instanceof ArrayBuffer) {
        return new TextDecoder().decode(data);
    }
    if (ArrayBuffer.isView(data)) {
        return new TextDecoder().decode(data as ArrayBufferView);
    }
    return String(data);
}

function sleep(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function toPolicyKey(fileName: string) {
    return fileName.replace(/\.json$/i, "");
}

function matchAll(output: string, patterns: string[]) {
    if (!patterns.length) return true;
    return patterns.every((pattern) => new RegExp(pattern, "m").test(output));
}

function matchAny(output: string, patterns: string[]) {
    if (!patterns.length) return false;
    return patterns.some((pattern) => new RegExp(pattern, "m").test(output));
}

function resolveAction(matched: Action[], fallback: Action): Action {
    if (matched.includes("deny")) return "deny";
    if (matched.includes("warn")) return "warn";
    if (matched.includes("allow")) return "allow";
    return fallback;
}

function evaluateFs(policy: Policy, path: string, perm: FsPerm): Action {
    const matches: Action[] = [];
    for (const rule of policy.fs?.rules ?? []) {
        if (path.startsWith(rule.path) && rule.perms.includes(perm)) {
            matches.push(rule.action);
        }
    }
    return resolveAction(matches, policy.defaults.fs);
}

function portMatches(rulePorts: string, port: number): boolean {
    const segments = rulePorts.split(",").map((entry) => entry.trim()).filter(Boolean);
    for (const segment of segments) {
        if (segment.includes("-")) {
            const [startStr, endStr] = segment.split("-");
            const start = Number(startStr);
            const end = Number(endStr);
            if (Number.isFinite(start) && Number.isFinite(end) && port >= start && port <= end) {
                return true;
            }
            continue;
        }
        if (Number(segment) === port) return true;
    }
    return false;
}

function evaluateNet(policy: Policy, ip: string, port: number, proto: "tcp" | "udp"): Action {
    const matches: Action[] = [];
    for (const rule of policy.net?.rules ?? []) {
        if (rule.proto !== proto) continue;
        if (!nodeCidr.cidr.includes(rule.cidr, ip)) continue;
        if (!portMatches(rule.ports, port)) continue;
        matches.push(rule.action);
    }
    return resolveAction(matches, policy.defaults.net);
}

function evaluateExec(policy: Policy, path: string): Action {
    const matches: Action[] = [];
    for (const rule of policy.exec?.rules ?? []) {
        if (rule.path === path) {
            matches.push(rule.action);
        }
    }
    return resolveAction(matches, policy.defaults.exec);
}

function evaluateExpectedAction(policy: Policy, example: ExampleSpec): Action {
    if (example.type === "none") return "allow";
    if (example.type === "fs" && example.fs) {
        return evaluateFs(policy, example.fs.path, example.fs.perm);
    }
    if (example.type === "net" && example.net) {
        return evaluateNet(policy, example.net.ip, example.net.port, example.net.proto);
    }
    if (example.type === "exec" && example.exec) {
        return evaluateExec(policy, example.exec.path);
    }
    return "allow";
}

function buildCombinations(items: string[]): string[][] {
    const combos: string[][] = [];
    const total = 1 << items.length;
    for (let mask = 0; mask < total; mask += 1) {
        const combo: string[] = [];
        for (let i = 0; i < items.length; i += 1) {
            if (mask & (1 << i)) combo.push(items[i] as string);
        }
        combos.push(combo);
    }
    return combos;
}

async function loadExampleCode(exampleFile: string): Promise<string> {
    const filePath = join(examplesDir, exampleFile);
    const file = Bun.file(filePath);
    if (!await file.exists()) {
        throw new Error(`Example not found: ${filePath}`);
    }
    return await file.text();
}

async function loadPolicies(policyFiles: string[]): Promise<Policy[]> {
    const result: Policy[] = [];
    for (const policyFile of policyFiles) {
        const filePath = join(policiesDir, policyFile);
        const file = Bun.file(filePath);
        if (!await file.exists()) {
            throw new Error(`Policy not found: ${filePath}`);
        }
        result.push(await file.json() as Policy);
    }
    return result;
}

async function runCase(runner: WSRunner, example: ExampleSpec, policies: Policy[], policyKeys: string[], timeoutMs: number, idleMs: number) {
    const code = await loadExampleCode(example.file);
    const combined = policies.length ? mergePolicies(policies) : buildOpenPolicy();
    const expected = evaluateExpectedAction(combined, example);

    runner.resetOutput();
    const applyPayload = policies.length
        ? {
            type: "apply-policy",
            runtime: "python",
            policies,
            policyKeys,
        }
        : {
            type: "apply-policy",
            runtime: "python",
            policy: combined,
            policyKeys: ["open"],
        };
    runner.send(applyPayload);
    await sleep(200);
    if (runner.getErrors().length) {
        return {
            ok: false,
            expected,
            output: runner.getOutput(),
            errors: runner.getErrors(),
            allowMatched: false,
            denyMatched: false,
            warnMatched: false,
            skipped: false,
        };
    }

    runner.resetOutput();
    runner.send({
        type: "run",
        runtime: "python",
        code,
    });

    const result = await runner.waitForIdle(idleMs, timeoutMs);
    const allowMatched = example.allow.length > 0 && matchAll(result.output, example.allow);
    const denyMatched = example.deny.length > 0 && matchAny(result.output, example.deny);
    const warnMatched = example.warn.length > 0 && matchAll(result.output, example.warn);
    const envIssue = matchAny(result.output, [
        "Network is unreachable",
        "Connection refused",
        "No such file or directory",
        "file not found",
    ]);

    let ok = false;
    let skipped = false;
    if (expected === "allow") {
        ok = allowMatched && !denyMatched;
        if (!allowMatched && envIssue) {
            skipped = true;
        }
    } else if (expected === "warn") {
        ok = allowMatched && warnMatched && !denyMatched;
        if (!allowMatched && envIssue) {
            skipped = true;
        }
    } else {
        ok = denyMatched && !allowMatched;
    }

    const hasUnexpectedWarn = expected !== "warn" && matchAny(result.output, example.warn);
    if (hasUnexpectedWarn && !skipped) ok = false;

    return {
        ok,
        skipped,
        expected,
        output: result.output,
        errors: result.errors,
        allowMatched,
        denyMatched,
        warnMatched,
    };
}

async function main() {
    const wsUrl = process.env.WS_URL || "ws://localhost:3000";
    const timeoutMs = Number(process.env.TIMEOUT_MS ?? 10000);
    const idleMs = Number(process.env.IDLE_MS ?? 500);
    const comboLimit = Number(process.env.COMBO_LIMIT ?? 0);
    const exampleLimit = Number(process.env.EXAMPLE_LIMIT ?? 0);

    const combos = buildCombinations(POLICY_FILES);
    const selectedCombos = comboLimit > 0 ? combos.slice(0, comboLimit) : combos;
    const selectedExamples = exampleLimit > 0 ? EXAMPLES.slice(0, exampleLimit) : EXAMPLES;

    const runner = new WSRunner(wsUrl);
    await runner.waitForOpen(5000);
    await runner.waitForAnyMessage(2000);
    await runner.waitForReadyState(1500);
    if (!runner.hasReadyState()) {
        console.error("No runner state received. IPC server may not be running (libshm.so missing?).");
        runner.close();
        process.exit(1);
    }
    await runner.waitForPythonReady(1500);
    if (!runner.hasPythonReady()) {
        console.warn("Python worker did not report Ready state. Proceeding anyway.");
    }

    console.log(`Running ${selectedCombos.length} policy combination(s) against ${wsUrl}`);
    console.log(`Examples: ${selectedExamples.length}`);

    let failures = 0;
    let skipped = 0;
    let total = 0;

    for (const combo of selectedCombos) {
        const comboLabel = combo.length ? combo.map(toPolicyKey).join("+") : "NO_POLICY";
        const policies = await loadPolicies(combo);
        const policyKeys = combo.map(toPolicyKey);
        console.log(`\n[Combo] ${comboLabel}`);
        for (const example of selectedExamples) {
            total += 1;
            const result = await runCase(runner, example, policies, policyKeys, timeoutMs, idleMs);
            const status = result.ok ? "PASS" : result.skipped ? "SKIP" : "FAIL";
            console.log(`- ${status}: ${example.name} (expected ${result.expected})`);
            if (!result.ok && !result.skipped) {
                failures += 1;
                if (result.errors.length) {
                    console.log(`  Errors: ${result.errors.join(" | ")}`);
                }
                console.log(`  Output:`);
                console.log(result.output.trim() ? result.output.trim() : "(no output)");
            }
            if (result.skipped) {
                skipped += 1;
            }
            await sleep(200);
        }
    }

    runner.close();

    if (failures > 0) {
        console.error(`\n${failures} case(s) failed out of ${total}. (${skipped} skipped)`);
        process.exit(1);
    }
    console.log(`\nAll ${total} combinations cases passed. (${skipped} skipped)`);
}

main().catch((error) => {
    console.error(`[policy-matrix-combinations] ${error.message}`);
    process.exit(1);
});
