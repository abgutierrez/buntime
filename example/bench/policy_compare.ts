const $ = Bun.$;

type Scenario = {
  label: string;
  command: string;
  args: string[];
  iterationEnvKey: string;
  defaultIterations: number;
  env?: Record<string, string>;
};

const baseEnv: Record<string, string> = {
  ...process.env,
  BENCH_ITER: process.env.BENCH_ITER ?? "200",
  BENCH_PATH: process.env.BENCH_PATH ?? "/tmp/bench.txt",
  BENCH_URL: process.env.BENCH_URL ?? "http://93.184.216.34",
};

const fsIterations = Number(process.env.BENCH_ITER_FS ?? "500");
const netIterations = Number(process.env.BENCH_ITER_NET ?? "50");
const noSandbox = process.env.BENCH_NO_SANDBOX === "1";

const scenarios: Scenario[] = [
  {
    label: "policy_on_fs",
    command: "bunx",
    args: buildArgs([
      "python-ipc-bun",
      "run",
      "--worker",
      "bun",
      "--policy=example/bench/policies/fs-allow.json",
      "example/bench/fs_read.ts",
    ]),
    iterationEnvKey: "BENCH_ITER_FS",
    defaultIterations: fsIterations,
  },
  {
    label: "policy_off_fs",
    command: "bunx",
    args: buildArgs([
      "python-ipc-bun",
      "run",
      "--worker",
      "bun",
      "--allow-all",
      "example/bench/fs_read.ts",
    ]),
    iterationEnvKey: "BENCH_ITER_FS",
    defaultIterations: fsIterations,
  },
  {
    label: "policy_on_net",
    command: "bunx",
    args: buildArgs([
      "python-ipc-bun",
      "run",
      "--worker",
      "bun",
      "--policy=example/bench/policies/net-allow.json",
      "example/bench/net_fetch.ts",
    ]),
    iterationEnvKey: "BENCH_ITER_NET",
    defaultIterations: netIterations,
  },
  {
    label: "policy_off_net",
    command: "bunx",
    args: buildArgs([
      "python-ipc-bun",
      "run",
      "--worker",
      "bun",
      "--allow-all",
      "example/bench/net_fetch.ts",
    ]),
    iterationEnvKey: "BENCH_ITER_NET",
    defaultIterations: netIterations,
  },
];

type BenchResult = {
  label: string;
  elapsedMs: number;
  exitCode: number;
  iterations: number;
  invocationsPerSec: number;
};

function buildArgs(args: string[]) {
  if (!noSandbox) return args;
  const insertAt = 3;
  const withFlag = [...args];
  withFlag.splice(insertAt, 0, "--no-sandbox");
  return withFlag;
}

async function runBench() {
  const results: BenchResult[] = [];

  for (const scenario of scenarios) {
    const start = performance.now();
    const env = { ...baseEnv, ...scenario.env };
    const iterations = Number(env[scenario.iterationEnvKey] ?? scenario.defaultIterations);
    env.BENCH_ITER = String(iterations);
    const proc = await $`${scenario.command} ${scenario.args}`.env(env).nothrow();
    const elapsedMs = performance.now() - start;
    const invocationsPerSec = elapsedMs > 0 ? iterations / (elapsedMs / 1000) : 0;
    results.push({
      label: scenario.label,
      elapsedMs,
      exitCode: proc.exitCode ?? 1,
      iterations,
      invocationsPerSec,
    });
    console.log(
      `[Bench] ${scenario.label} elapsed_ms=${elapsedMs.toFixed(2)} iter=${iterations} ips=${invocationsPerSec.toFixed(
        2,
      )} exit=${proc.exitCode}`,
    );
  }

  return results;
}

function printSummary(results: BenchResult[]) {
  console.log("\n[Bench] Summary");
  for (const result of results) {
    console.log(
      `${result.label.padEnd(16)} ${result.elapsedMs
        .toFixed(2)
        .padStart(10)} ms ${String(result.iterations).padStart(6)} iter ${result.invocationsPerSec
        .toFixed(2)
        .padStart(8)} ips exit=${result.exitCode}`,
    );
  }

  const pairs = [
    { on: "policy_on_fs", off: "policy_off_fs", label: "fs" },
    { on: "policy_on_net", off: "policy_off_net", label: "net" },
  ];

  for (const pair of pairs) {
    const on = results.find((result) => result.label === pair.on);
    const off = results.find((result) => result.label === pair.off);
    if (!on || !off) continue;
    const ratio = off.invocationsPerSec > 0 ? on.invocationsPerSec / off.invocationsPerSec : 0;
    console.log(
      `[Bench] Policy impact ${pair.label} = ${ratio.toFixed(2)}x (${on.invocationsPerSec.toFixed(
        2,
      )} ips vs ${off.invocationsPerSec.toFixed(2)} ips)`,
    );
  }
}

if (import.meta.main) {
  const results = await runBench();
  printSummary(results);
}
