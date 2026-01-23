import { join } from "path";

interface PolicyMatrixSpec {
    defaults?: {
        timeoutMs?: number;
        idleMs?: number;
    };
    cases: PolicyCaseSpec[];
}

interface PolicyCaseSpec {
    name: string;
    example: string;
    policies: string[];
    expect: {
        allow?: string[];
        deny?: string[];
        warn?: string[];
    };
    timeoutMs?: number;
    idleMs?: number;
}

interface OutputResult {
    output: string;
    errors: string[];
}

const examplesDir = join(process.cwd(), "example");
const policiesDir = join(process.cwd(), "src/policies");

function sleep(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function toPolicyKey(fileName: string) {
    return fileName.replace(/\.json$/i, "");
}

function matchAll(output: string, patterns: string[] | undefined) {
    if (!patterns?.length) return true;
    return patterns.every((pattern) => new RegExp(pattern, "m").test(output));
}

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

    send(payload: unknown) {
        this.ws.send(JSON.stringify(payload));
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

    getOutput() {
        return this.output;
    }

    getErrors() {
        return this.errors;
    }

    resetOutput() {
        this.output = "";
        this.errors = [];
        this.lastOutputAt = Date.now();
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

async function loadSpec(filePath: string): Promise<PolicyMatrixSpec> {
    const file = Bun.file(filePath);
    if (!await file.exists()) {
        throw new Error(`Spec file not found: ${filePath}`);
    }
    return await file.json() as PolicyMatrixSpec;
}

async function loadExampleCode(exampleFile: string): Promise<string> {
    const filePath = join(examplesDir, exampleFile);
    const file = Bun.file(filePath);
    if (!await file.exists()) {
        throw new Error(`Example not found: ${filePath}`);
    }
    return await file.text();
}

async function loadPolicies(policyFiles: string[]): Promise<unknown[]> {
    const result: unknown[] = [];
    for (const policyFile of policyFiles) {
        const filePath = join(policiesDir, policyFile);
        const file = Bun.file(filePath);
        if (!await file.exists()) {
            throw new Error(`Policy not found: ${filePath}`);
        }
        result.push(await file.json());
    }
    return result;
}

async function runCase(runner: WSRunner, spec: PolicyCaseSpec, defaults: PolicyMatrixSpec["defaults"]) {
    const timeoutMs = spec.timeoutMs ?? defaults?.timeoutMs ?? 8000;
    const idleMs = spec.idleMs ?? defaults?.idleMs ?? 400;
    const code = await loadExampleCode(spec.example);
    const policies = await loadPolicies(spec.policies);
    const policyKeys = spec.policies.map(toPolicyKey);

    runner.resetOutput();
    runner.send({
        type: "apply-policy",
        runtime: "python",
        policies,
        policyKeys,
    });
    await sleep(200);
    if (runner.getErrors().length) {
        return {
            ok: false,
            output: runner.getOutput(),
            errors: runner.getErrors(),
            allowOk: false,
            denyOk: false,
            warnOk: false,
        };
    }

    runner.resetOutput();
    runner.send({
        type: "run",
        runtime: "python",
        code,
    });

    const result = await runner.waitForIdle(idleMs, timeoutMs);
    const allowOk = matchAll(result.output, spec.expect.allow);
    const denyOk = matchAll(result.output, spec.expect.deny);
    const warnOk = matchAll(result.output, spec.expect.warn);
    const ok = allowOk && denyOk && warnOk;

    return {
        ok,
        output: result.output,
        errors: result.errors,
        allowOk,
        denyOk,
        warnOk,
    };
}

async function main() {
    const specPath = process.env.SPEC_FILE || join(examplesDir, "policy-matrix.spec.json");
    const wsUrl = process.env.WS_URL || "ws://localhost:3000";

    const spec = await loadSpec(specPath);
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

    let failures = 0;
    console.log(`Running ${spec.cases.length} policy matrix cases against ${wsUrl}`);

    for (const caseSpec of spec.cases) {
        const result = await runCase(runner, caseSpec, spec.defaults);
        const status = result.ok ? "PASS" : "FAIL";
        console.log(`- ${status}: ${caseSpec.name}`);
        if (!result.ok) {
            failures += 1;
            if (result.errors.length) {
                console.log(`  Errors: ${result.errors.join(" | ")}`);
            }
            if (!result.allowOk) {
                console.log("  Missing allow markers:", caseSpec.expect.allow ?? []);
            }
            if (!result.denyOk) {
                console.log("  Missing deny markers:", caseSpec.expect.deny ?? []);
            }
            if (!result.warnOk) {
                console.log("  Missing warn markers:", caseSpec.expect.warn ?? []);
            }
            console.log("  Output:");
            console.log(result.output.trim() ? result.output.trim() : "(no output)");
        }
        await sleep(200);
    }

    runner.close();

    if (failures > 0) {
        console.error(`\n${failures} case(s) failed.`);
        process.exit(1);
    }
    console.log("\nAll policy matrix cases passed.");
}

main().catch((error) => {
    console.error(`[policy-matrix] ${error.message}`);
    process.exit(1);
});
