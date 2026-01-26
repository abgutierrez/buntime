export interface BenchConfig {
  runs: number;
  cliMode: string;
  benchWorker: string;
  noSandbox: boolean;
  proxyOverride?: string;
}

export interface BenchEnv extends Record<string, string | undefined> {
  BENCH_RUNS?: string;
  BENCH_ITER_FS?: string;
  BENCH_ITER_NET?: string;
  BENCH_FS_OPS?: string;
  BENCH_NET_OPS?: string;
  BENCH_FS_WRITE_EVERY?: string;
  BENCH_NET_TIMEOUT_MS?: string;
  BENCH_PATH?: string;
  BENCH_URL?: string;
  BENCH_ALLOW_HOST?: string;
  BENCH_DENY_HOST?: string;
  BENCH_TARGET_PORT?: string;
  BENCH_CLI?: string;
  BENCH_WORKER?: string;
  BENCH_NO_SANDBOX?: string;
  BENCH_PROXY_URL?: string;
  BENCH_REPORT_RUNS?: string;
  BENCH_REPORT_PATH?: string;
  // Legacy support for compare.ts
  BENCH_ITER?: string;
  BENCH_HOST?: string;
  BENCH_PORT?: string;
  BENCH_ITER_FS_STRESS?: string;
  BENCH_ITER_NET_STRESS?: string;
}

export function parseBenchConfig(env: BenchEnv = process.env): BenchConfig {
  const defaultProxy = process.platform === "darwin" ? "http://127.0.0.1:8080" : undefined;
  return {
    runs: Number(env.BENCH_RUNS ?? "3"),
    cliMode: env.BENCH_CLI ?? "bunx",
    benchWorker: env.BENCH_WORKER ?? "bun",
    noSandbox: env.BENCH_NO_SANDBOX === "1",
    proxyOverride: env.BENCH_PROXY_URL ?? defaultProxy,
  };
}

export function buildCliArgs(config: BenchConfig, script: string, flags: string[]): string[] {
  const args =
    config.cliMode === "bun"
      ? ["src/cli.ts", "run", "--worker", config.benchWorker]
      : ["python-ipc-bun", "run", "--worker", config.benchWorker];
  
  if (config.noSandbox) {
    args.push("--no-sandbox");
  }
  
  args.push(...flags, "--", script);
  return args;
}

export const DEFAULT_BENCH_ENV: Record<string, string> = {
  BENCH_PATH: process.env.BENCH_PATH ?? "/tmp/bench.txt",
  BENCH_URL: process.env.BENCH_URL ?? "http://localhost:9",
  BENCH_ALLOW_HOST: process.env.BENCH_ALLOW_HOST ?? "localhost",
  BENCH_DENY_HOST: process.env.BENCH_DENY_HOST ?? "127.0.0.1",
  BENCH_TARGET_PORT: process.env.BENCH_TARGET_PORT ?? "9",
  BENCH_NET_TIMEOUT_MS: process.env.BENCH_NET_TIMEOUT_MS ?? "300",
};
