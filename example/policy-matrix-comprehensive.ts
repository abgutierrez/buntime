import { join } from "path";

interface PolicyMatrixEnvironment {
    name: string;
    description: string;
    policies: string[];
    cases: PolicyCaseSpec[];
}

interface PolicyCaseSpec {
    name: string;
    example: string;
    policies?: string[];
    expect: {
        allow?: string[];
        deny?: string[];
        warn?: string[];
    };
    timeoutMs?: number;
    idleMs?: number;
}

interface ComprehensiveSpec {
    defaults?: {
        timeoutMs?: number;
        idleMs?: number;
    };
    environments: PolicyMatrixEnvironment[];
}

interface OutputResult {
    output: string;
    errors: string[];
}

interface CaseResult {
    ok: boolean;
    environment: string;
    testName: string;
    policies: string;
    output: string;
    errors: string[];
    allowOk: boolean;
    denyOk: boolean;
    warnOk: boolean;
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

async function loadSpec(filePath: string): Promise<ComprehensiveSpec> {
    const file = Bun.file(filePath);
    if (!await file.exists()) {
        throw new Error(`Spec file not found: ${filePath}`);
    }
    return await file.json() as ComprehensiveSpec;
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

async function runCase(runner: WSRunner, spec: PolicyCaseSpec, defaults: ComprehensiveSpec["defaults"], environmentName: string) {
    const timeoutMs = spec.timeoutMs ?? defaults?.timeoutMs ?? 10000;
    const idleMs = spec.idleMs ?? defaults?.idleMs ?? 500;
    const code = await loadExampleCode(spec.example);
    const policies = await loadPolicies(spec.policies || []);
    const policyKeys = (spec.policies || []).map(toPolicyKey);
    const policyList = policyKeys.length > 0 ? policyKeys.join(", ") : "NONE";

    runner.resetOutput();
    if (policies.length > 0) {
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
                environment: environmentName,
                testName: spec.name,
                policies: policyList,
                output: runner.getOutput(),
                errors: runner.getErrors(),
                allowOk: false,
                denyOk: false,
                warnOk: false,
            } as CaseResult;
        }
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
        environment: environmentName,
        testName: spec.name,
        policies: policyList,
        output: result.output,
        errors: result.errors,
        allowOk,
        denyOk,
        warnOk,
    } as CaseResult;
}

async function runEnvironment(runner: WSRunner, env: PolicyMatrixEnvironment, defaults: ComprehensiveSpec["defaults"]) {
    console.log(`\n${"=".repeat(60)}`);
    console.log(`ENVIRONMENT: ${env.name}`);
    console.log(`Description: ${env.description}`);
    console.log(`Policies: ${env.policies.length > 0 ? env.policies.join(", ") : "NONE"}`);
    console.log(`${"=".repeat(60)}\n`);

    let failures = 0;
    let total = env.cases.length;

    for (let i = 0; i < env.cases.length; i++) {
        const caseSpec = env.cases[i];
        if (!caseSpec) {
            continue;
        }
        const progress = `[${i + 1}/${total}]`;
        const result = await runCase(runner, caseSpec, defaults, env.name);
        const status = result.ok ? "PASS" : "FAIL";
        const statusColor = result.ok ? "\x1b[32m" : "\x1b[31m";
        const resetColor = "\x1b[0m";
        console.log(`${statusColor}${status}${resetColor} ${progress} ${result.policies ? `| ${result.policies}` : "| NO POLICY"}: ${caseSpec.name}`);
        
        if (!result.ok) {
            failures += 1;
            if (result.errors.length) {
                console.log(`  Errors: ${result.errors.join(" | ")}`);
            }
            if (!result.allowOk) {
                console.log(`  Missing allow markers:`, result.allowOk ? "[]" : (caseSpec.expect.allow ?? []));
            }
            if (!result.denyOk) {
                console.log(`  Missing deny markers:`, result.denyOk ? "[]" : (caseSpec.expect.deny ?? []));
            }
            if (!result.warnOk) {
                console.log(`  Missing warn markers:`, result.warnOk ? "[]" : (caseSpec.expect.warn ?? []));
            }
            console.log("  Output:");
            console.log(result.output.trim() ? result.output.trim() : "(no output)");
        }
        await sleep(200);
    }

    const envResult = { environment: env.name, total, failures, passed: total - failures };
    console.log(`\n${"-".repeat(60)}`);
    console.log(`Environment ${env.name} Results: ${envResult.passed}/${envResult.total} passed, ${envResult.failures} failed`);
    
    return envResult;
}

async function main() {
    const specPath = process.env.SPEC_FILE || join(examplesDir, "policy-matrix-comprehensive.spec.json");
    const wsUrl = process.env.WS_URL || "ws://localhost:3000";
    const envFilter = process.env.ENVIRONMENT;

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

    const environmentsToRun = envFilter
        ? spec.environments.filter(env => env.name === envFilter)
        : spec.environments;

    console.log(`Running ${environmentsToRun.length} environment(s) against ${wsUrl}`);
    if (envFilter) {
        console.log(`Filtering to environment: ${envFilter}`);
    }

    const results = [];
    let totalFailures = 0;
    let totalPassed = 0;
    let totalCases = 0;

    for (const env of environmentsToRun) {
        const envResult = await runEnvironment(runner, env, spec.defaults);
        results.push(envResult);
        totalFailures += envResult.failures;
        totalPassed += envResult.passed;
        totalCases += envResult.total;
    }

    runner.close();

    console.log(`\n${"=".repeat(80)}`);
    console.log("FINAL RESULTS");
    console.log(`${"=".repeat(80)}`);
    console.log(`Total Environments: ${results.length}`);
    console.log(`Total Test Cases: ${totalCases}`);
    console.log(`Total Passed: ${totalPassed}`);
    console.log(`Total Failed: ${totalFailures}`);
    console.log(`Success Rate: ${((totalPassed / totalCases) * 100).toFixed(1)}%`);
    
    console.log(`\n${"-".repeat(80)}`);
    console.log("ENVIRONMENT SUMMARY");
    console.log(`${"-".repeat(80)}`);
    for (const result of results) {
        const statusColor = result.failures === 0 ? "\x1b[32m" : "\x1b[31m";
        const resetColor = "\x1b[0m";
        const status = result.failures === 0 ? "PASS" : "FAIL";
        console.log(`${statusColor}${status}${resetColor} ${result.environment}: ${result.passed}/${result.total} passed (${result.failures} failed)`);
    }

    if (totalFailures > 0) {
        console.error(`\n${totalFailures} test case(s) failed across all environments.`);
        process.exit(1);
    }
    console.log("\nAll comprehensive policy matrix tests passed.");
}

main().catch((error) => {
    console.error(`[policy-matrix-comprehensive] ${error.message}`);
    process.exit(1);
});
