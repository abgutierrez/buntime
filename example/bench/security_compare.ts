const $ = Bun.$;

type Scenario = {
  id: string;
  label: string;
  script: string;
  command: string;
  args: string[];
  env: Record<string, string>;
};

type BenchMeta = {
  proxyMode?: string;
  fsOps?: number;
  fsReads?: number;
  fsWrites?: number;
  fsErrors?: number;
  netOps?: number;
  netAllowed?: number;
  netDenied?: number;
  netErrors?: number;
  fsElapsedMs?: number;
  netElapsedMs?: number;
};

type ScenarioStats = {
  scenario: Scenario;
  avgMs: number;
  maxMs: number;
  runs: number;
  exitCode: number;
  meta: BenchMeta | null;
};

const runs = Number(process.env.BENCH_RUNS ?? "3");
const fsIterations = Number(process.env.BENCH_ITER_FS ?? "500");
const netIterations = Number(process.env.BENCH_ITER_NET ?? "5");
const validationFsOps = Number(process.env.BENCH_FS_OPS ?? "200");
const validationNetOps = Number(process.env.BENCH_NET_OPS ?? "6");
const validationWriteEvery = Number(process.env.BENCH_FS_WRITE_EVERY ?? "10");
const netTimeoutMs = Number(process.env.BENCH_NET_TIMEOUT_MS ?? "300");

const benchPath = process.env.BENCH_PATH ?? "/tmp/bench.txt";
const benchUrl = process.env.BENCH_URL ?? "http://localhost:9";
const allowHost = process.env.BENCH_ALLOW_HOST ?? "localhost";
const denyHost = process.env.BENCH_DENY_HOST ?? "127.0.0.1";

const cliMode = process.env.BENCH_CLI ?? "bunx";
const noSandbox = process.env.BENCH_NO_SANDBOX === "1";
const defaultProxy = process.platform === "darwin" ? "http://127.0.0.1:8080" : undefined;
const proxyOverride = process.env.BENCH_PROXY_URL ?? defaultProxy;

const baseEnv: Record<string, string> = {
  ...process.env,
  BENCH_PATH: benchPath,
  BENCH_URL: benchUrl,
  BENCH_NET_TIMEOUT_MS: String(netTimeoutMs),
};

console.log(`[Bench] CLI mode: ${cliMode}`);

type ScriptConfig = {
  id: string;
  label: string;
  script: string;
  env: Record<string, string>;
  policyFlags: string[];
};

const scripts: ScriptConfig[] = [
  {
    id: "fs_read",
    label: "fs_read",
    script: "example/bench/fs_read.ts",
    env: { BENCH_ITER: String(fsIterations) },
    policyFlags: [
      `--allow-read=${benchPath}`,
      `--allow-write=${benchPath}`,
    ],
  },
  {
    id: "net_fetch",
    label: "net_fetch",
    script: "example/bench/net_fetch.ts",
    env: {
      BENCH_ITER: String(netIterations),
      BENCH_URL: benchUrl,
      BENCH_TIMEOUT_MS: String(netTimeoutMs),
    },
    policyFlags: [`--allow-net=${allowHost}`],
  },
  {
    id: "validation_stress",
    label: "validation_stress",
    script: "example/bench/validation_stress.js",
    env: {
      BENCH_FS_OPS: String(validationFsOps),
      BENCH_NET_OPS: String(validationNetOps),
      BENCH_FS_WRITE_EVERY: String(validationWriteEvery),
      BENCH_ALLOW_HOST: allowHost,
      BENCH_DENY_HOST: denyHost,
    },
    policyFlags: [
      `--allow-read=${benchPath}`,
      `--allow-write=${benchPath}`,
      `--allow-net=${allowHost}`,
    ],
  },
];

function buildCliArgs(script: string, flags: string[]) {
  const args =
    cliMode === "bun"
      ? ["src/cli.ts", "run", "--worker", "bun"]
      : ["python-ipc-bun", "run", "--worker", "bun"];
  if (noSandbox) {
    args.push("--no-sandbox");
  }
  args.push(...flags, "--", script);
  return args;
}

function parseBenchMeta(output: string): BenchMeta | null {
  const line = output
    .split("\n")
    .find((entry) => entry.trim().startsWith("[BenchMeta]"));
  if (!line) return null;
  const json = line.slice(line.indexOf(" ") + 1).trim();
  try {
    return JSON.parse(json) as BenchMeta;
  } catch {
    return null;
  }
}

async function runScenario(scenario: Scenario): Promise<ScenarioStats> {
  const elapsed: number[] = [];
  let exitCode = 0;
  let meta: BenchMeta | null = null;

  for (let i = 0; i < runs; i += 1) {
    const start = performance.now();
    const proc = await $`${scenario.command} ${scenario.args}`.env(scenario.env).nothrow();
    const elapsedMs = performance.now() - start;
    elapsed.push(elapsedMs);
    exitCode = Math.max(exitCode, proc.exitCode ?? 1);
    const stdout = proc.stdout.toString();
    meta = meta ?? parseBenchMeta(stdout);
  }

  const avgMs = elapsed.reduce((sum, value) => sum + value, 0) / elapsed.length;
  const maxMs = Math.max(...elapsed);

  return {
    scenario,
    avgMs,
    maxMs,
    runs: elapsed.length,
    exitCode,
    meta,
  };
}

const scenarios: Scenario[] = [];
for (const script of scripts) {
  const baseEnvForScript = { ...baseEnv, ...script.env };

  scenarios.push({
    id: `${script.id}_native`,
    label: `${script.label} native`,
    script: script.script,
    command: "bun",
    args: [script.script],
    env: baseEnvForScript,
  });

  const supervisedEnv = proxyOverride
    ? { ...baseEnvForScript, BENCH_PROXY_URL: proxyOverride }
    : baseEnvForScript;

  scenarios.push({
    id: `${script.id}_policy_on`,
    label: `${script.label} policy_on`,
    script: script.script,
    command: cliMode === "bun" ? "bun" : "bunx",
    args: buildCliArgs(script.script, script.policyFlags),
    env: supervisedEnv,
  });

  scenarios.push({
    id: `${script.id}_policy_off`,
    label: `${script.label} policy_off`,
    script: script.script,
    command: cliMode === "bun" ? "bun" : "bunx",
    args: buildCliArgs(script.script, ["--allow-all"]),
    env: supervisedEnv,
  });
}

const results: ScenarioStats[] = [];
for (const scenario of scenarios) {
  const stats = await runScenario(scenario);
  results.push(stats);
  console.log(
    `[Bench] ${scenario.label} avg_ms=${stats.avgMs.toFixed(2)} max_ms=${stats.maxMs.toFixed(
      2,
    )} runs=${stats.runs} exit=${stats.exitCode}`,
  );
}

console.log("\n[Bench] Summary");
for (const stats of results) {
  console.log(
    `${stats.scenario.label.padEnd(26)} ${stats.avgMs
      .toFixed(2)
      .padStart(10)} ms avg ${stats.maxMs.toFixed(2).padStart(10)} ms max`,
  );
  if (stats.meta) {
    console.log(`[Bench] meta ${stats.scenario.label}: ${JSON.stringify(stats.meta)}`);
  }
}

const byScript = new Map<string, { native?: ScenarioStats; on?: ScenarioStats; off?: ScenarioStats }>();
for (const stats of results) {
  const baseId = stats.scenario.id.replace(/_(native|policy_on|policy_off)$/, "");
  const current = byScript.get(baseId) ?? {};
  if (stats.scenario.id.endsWith("_native")) current.native = stats;
  if (stats.scenario.id.endsWith("_policy_on")) current.on = stats;
  if (stats.scenario.id.endsWith("_policy_off")) current.off = stats;
  byScript.set(baseId, current);
}

console.log("\n[Bench] Comparisons (avg) ");
for (const [scriptId, group] of byScript) {
  if (!group.native || !group.on || !group.off) continue;
  const onRatio = group.on.avgMs / group.native.avgMs;
  const offRatio = group.off.avgMs / group.native.avgMs;
  const policyDelta = group.on.avgMs / group.off.avgMs;
  console.log(
    `- ${scriptId}: policy_on/native x${onRatio.toFixed(2)}, policy_off/native x${offRatio.toFixed(
      2,
    )}, policy_on/off x${policyDelta.toFixed(2)}`,
  );
}
