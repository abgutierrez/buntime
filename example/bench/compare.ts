const $ = Bun.$;

export type Scenario = {
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
  BENCH_URL: process.env.BENCH_URL ?? "http://example.com",
  BENCH_HOST: process.env.BENCH_HOST ?? "93.184.216.34",
  BENCH_PORT: process.env.BENCH_PORT ?? "80",
};

const fsIterations = Number(process.env.BENCH_ITER_FS ?? "500");
const netIterations = Number(process.env.BENCH_ITER_NET ?? "30");
const fsStressIterations = Number(process.env.BENCH_ITER_FS_STRESS ?? "3000");
const netStressIterations = Number(process.env.BENCH_ITER_NET_STRESS ?? "200");

const scenarios: Scenario[] = [
  {
    label: "policy_fs_allow",
    command: "bun",
    args: [
      "src/cli.ts",
      "run",
      "--policy=example/bench/policies/fs-allow.json",
      "example/bench/fs_read.py",
    ],
    iterationEnvKey: "BENCH_ITER_FS",
    defaultIterations: fsIterations,
  },
  {
    label: "policy_fs_warn",
    command: "bun",
    args: [
      "src/cli.ts",
      "run",
      "--policy=example/bench/policies/fs-warn.json",
      "example/bench/fs_read.py",
    ],
    iterationEnvKey: "BENCH_ITER_FS",
    defaultIterations: fsIterations,
  },
  {
    label: "policy_fs_deny",
    command: "bun",
    args: [
      "src/cli.ts",
      "run",
      "--policy=example/bench/policies/fs-deny.json",
      "example/bench/fs_read.py",
    ],
    iterationEnvKey: "BENCH_ITER_FS",
    defaultIterations: fsIterations,
  },
  {
    label: "policy_fs_allow_stress",
    command: "bun",
    args: [
      "src/cli.ts",
      "run",
      "--policy=example/bench/policies/fs-allow.json",
      "example/bench/fs_read.py",
    ],
    iterationEnvKey: "BENCH_ITER_FS_STRESS",
    defaultIterations: fsStressIterations,
  },
  {
    label: "policy_fs_warn_stress",
    command: "bun",
    args: [
      "src/cli.ts",
      "run",
      "--policy=example/bench/policies/fs-warn.json",
      "example/bench/fs_read.py",
    ],
    iterationEnvKey: "BENCH_ITER_FS_STRESS",
    defaultIterations: fsStressIterations,
  },
  {
    label: "policy_fs_deny_stress",
    command: "bun",
    args: [
      "src/cli.ts",
      "run",
      "--policy=example/bench/policies/fs-deny.json",
      "example/bench/fs_read.py",
    ],
    iterationEnvKey: "BENCH_ITER_FS_STRESS",
    defaultIterations: fsStressIterations,
  },
  {
    label: "policy_net_allow",
    command: "bun",
    args: [
      "src/cli.ts",
      "run",
      "--policy=example/bench/policies/net-allow.json",
      "example/bench/net_connect.py",
    ],
    iterationEnvKey: "BENCH_ITER_NET",
    defaultIterations: netIterations,
  },
  {
    label: "policy_net_warn",
    command: "bun",
    args: [
      "src/cli.ts",
      "run",
      "--policy=example/bench/policies/net-warn.json",
      "example/bench/net_connect.py",
    ],
    iterationEnvKey: "BENCH_ITER_NET",
    defaultIterations: netIterations,
  },
  {
    label: "policy_net_deny",
    command: "bun",
    args: [
      "src/cli.ts",
      "run",
      "--policy=example/bench/policies/net-deny.json",
      "example/bench/net_connect.py",
    ],
    iterationEnvKey: "BENCH_ITER_NET",
    defaultIterations: netIterations,
  },
  {
    label: "policy_net_allow_stress",
    command: "bun",
    args: [
      "src/cli.ts",
      "run",
      "--policy=example/bench/policies/net-allow.json",
      "example/bench/net_connect.py",
    ],
    iterationEnvKey: "BENCH_ITER_NET_STRESS",
    defaultIterations: netStressIterations,
  },
  {
    label: "policy_net_warn_stress",
    command: "bun",
    args: [
      "src/cli.ts",
      "run",
      "--policy=example/bench/policies/net-warn.json",
      "example/bench/net_connect.py",
    ],
    iterationEnvKey: "BENCH_ITER_NET_STRESS",
    defaultIterations: netStressIterations,
  },
  {
    label: "policy_net_deny_stress",
    command: "bun",
    args: [
      "src/cli.ts",
      "run",
      "--policy=example/bench/policies/net-deny.json",
      "example/bench/net_connect.py",
    ],
    iterationEnvKey: "BENCH_ITER_NET_STRESS",
    defaultIterations: netStressIterations,
  },
  {
    label: "bun_worker_fs",
    command: "bun",
    args: ["src/cli.ts", "run", "--worker", "bun", "example/bench/fs_read.ts"],
    iterationEnvKey: "BENCH_ITER_FS",
    defaultIterations: fsIterations,
  },
  {
    label: "native_bun_fs",
    command: "bun",
    args: ["example/bench/fs_read.ts"],
    iterationEnvKey: "BENCH_ITER_FS",
    defaultIterations: fsIterations,
  },
  {
    label: "bun_worker_net",
    command: "bun",
    args: ["src/cli.ts", "run", "--worker", "bun", "example/bench/net_fetch.ts"],
    iterationEnvKey: "BENCH_ITER_NET",
    defaultIterations: netIterations,
  },
  {
    label: "native_bun_net",
    command: "bun",
    args: ["example/bench/net_fetch.ts"],
    iterationEnvKey: "BENCH_ITER_NET",
    defaultIterations: netIterations,
  },
];

export type BenchResult = {
  label: string;
  elapsedMs: number;
  exitCode: number;
  iterations: number;
  invocationsPerSec: number;
};

export async function runBench(
  overrides?: Record<string, string>,
  options: { log?: boolean } = {},
) {
  const results: BenchResult[] = [];
  const shouldLog = options.log ?? true;

  for (const scenario of scenarios) {
    const start = performance.now();
    const env = { ...baseEnv, ...overrides, ...scenario.env };
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
    if (shouldLog) {
      console.log(
        `[Bench] ${scenario.label} elapsed_ms=${elapsedMs.toFixed(2)} iter=${
          iterations
        } ips=${invocationsPerSec.toFixed(2)} exit=${proc.exitCode}`,
      );
    }
  }

  return results;
}

function printSummary(results: BenchResult[]) {
  console.log("\n[Bench] Summary");
  for (const result of results) {
    console.log(
      `${result.label.padEnd(24)} ${result.elapsedMs
        .toFixed(2)
        .padStart(10)} ms ${String(result.iterations).padStart(6)} iter ${
        result.invocationsPerSec.toFixed(2)
      } ips exit=${result.exitCode}`,
    );
  }

  const fsWorker = results.find((result) => result.label === "bun_worker_fs");
  const fsNative = results.find((result) => result.label === "native_bun_fs");
  const netWorker = results.find((result) => result.label === "bun_worker_net");
  const netNative = results.find((result) => result.label === "native_bun_net");

  if (fsWorker && fsNative) {
    const ratio = fsWorker.invocationsPerSec / fsNative.invocationsPerSec;
    console.log(
      `\n[Bench] Throughput fs worker/native = ${ratio.toFixed(2)}x (${fsWorker.invocationsPerSec.toFixed(
        2,
      )} ips vs ${fsNative.invocationsPerSec.toFixed(2)} ips)`,
    );
  }

  if (netWorker && netNative) {
    const ratio = netWorker.invocationsPerSec / netNative.invocationsPerSec;
    console.log(
      `[Bench] Throughput net worker/native = ${ratio.toFixed(2)}x (${netWorker.invocationsPerSec.toFixed(
        2,
      )} ips vs ${netNative.invocationsPerSec.toFixed(2)} ips)`,
    );
  }
}

if (import.meta.main) {
  const results = await runBench();
  printSummary(results);
}
