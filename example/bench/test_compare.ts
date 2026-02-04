const $ = Bun.$;

type RunResult = {
  elapsedMs: number;
  exitCode: number;
};

type ScenarioResult = {
  file: string;
  direct: SummaryStats;
  buntime: SummaryStats;
};

type SummaryStats = {
  runs: number;
  avgMs: number;
  minMs: number;
  maxMs: number;
  exitCodes: number[];
};

const benchRuns = Math.max(1, Number(process.env.BENCH_RUNS ?? "3"));
const benchWorker = process.env.BENCH_WORKER ?? "bun";
const reportPath = process.env.REPORT_PATH ?? "";

async function runCommand(
  command: string,
  args: string[],
  env?: Record<string, string>,
): Promise<RunResult> {
  const start = performance.now();
  const shell = env ? $.env({ ...process.env, ...env }) : $;
  const proc = await shell`${command} ${args}`.nothrow();
  const elapsedMs = performance.now() - start;
  return { elapsedMs, exitCode: proc.exitCode ?? 1 };
}

async function runScenario(
  command: string,
  args: string[],
  runs: number,
  env?: Record<string, string>,
): Promise<SummaryStats> {
  const results: RunResult[] = [];
  for (let i = 0; i < runs; i += 1) {
    results.push(await runCommand(command, args, env));
  }

  const elapsed = results.map((result) => result.elapsedMs);
  const total = elapsed.reduce((sum, value) => sum + value, 0);
  const minMs = Math.min(...elapsed);
  const maxMs = Math.max(...elapsed);
  const exitCodes = results.map((result) => result.exitCode);

  return {
    runs,
    avgMs: total / runs,
    minMs,
    maxMs,
    exitCodes,
  };
}

async function loadTestFiles(): Promise<string[]> {
  const glob = new Bun.Glob("src/tests/**/*.test.ts");
  const files: string[] = [];
  for await (const file of glob.scan({ cwd: process.cwd(), onlyFiles: true })) {
    files.push(file);
  }
  files.sort();
  return files;
}

function formatMs(value: number): string {
  return value.toFixed(2);
}

function summarize(results: ScenarioResult[]): string {
  const lines: string[] = [];
  const now = new Date();
  lines.push(`# Test Runtime Comparison (${now.toISOString().slice(0, 10)})`);
  lines.push("");
  lines.push("## Configuration");
  lines.push("");
  lines.push(`- BENCH_RUNS=${benchRuns}`);
  lines.push(`- BENCH_WORKER=${benchWorker}`);
  lines.push(`- Direct: bun test <test-file>`);
  lines.push(
    `- Buntime: WORKER_TEST_FILE=<test-file> bun src/cli.ts run --allow-all --worker ${benchWorker} example/bench/run-bun-test.ts`,
  );
  lines.push("");
  lines.push("## Results (avg/min/max, ms)");
  lines.push("");
  lines.push(
    "| Test file | Bun avg/min/max | Buntime avg/min/max | Delta (ms) | Ratio | Exit codes |",
  );
  lines.push("| --- | --- | --- | --- | --- | --- |");

  for (const result of results) {
    const delta = result.buntime.avgMs - result.direct.avgMs;
    const ratio = result.direct.avgMs > 0 ? result.buntime.avgMs / result.direct.avgMs : 0;
    const exitCodes = `bun:${result.direct.exitCodes.join("/")}, buntime:${result.buntime.exitCodes.join("/")}`;
    lines.push(
      `| ${result.file} | ${formatMs(result.direct.avgMs)}/${formatMs(result.direct.minMs)}/${formatMs(
        result.direct.maxMs,
      )} | ${formatMs(result.buntime.avgMs)}/${formatMs(result.buntime.minMs)}/${formatMs(
        result.buntime.maxMs,
      )} | ${delta >= 0 ? "+" : ""}${formatMs(delta)} | ${ratio.toFixed(2)}x | ${exitCodes} |`,
    );
  }

  lines.push("");
  lines.push("## Notes");
  lines.push("");
  lines.push("- Measures wall-clock time for each command invocation.");
  lines.push("- Includes supervisor/worker startup overhead for buntime runs.");
  lines.push("- Buntime run uses a bun worker that invokes bun test via run-bun-test.ts.");
  lines.push("- Buntime exit codes may be non-zero when using bun worker (CLI expects python exec_end).");

  return lines.join("\n");
}

async function main() {
  const files = await loadTestFiles();
  if (files.length === 0) {
    console.error("No test files found under src/tests.");
    process.exit(1);
  }

  const results: ScenarioResult[] = [];
  for (const file of files) {
    const direct = await runScenario("bun", ["test", file], benchRuns);
    const buntime = await runScenario(
      "bun",
      [
        "src/cli.ts",
        "run",
        "--allow-all",
        "--worker",
        benchWorker,
        "example/bench/run-bun-test.ts",
      ],
      benchRuns,
      { WORKER_TEST_FILE: file },
    );
    results.push({ file, direct, buntime });
  }

  const report = summarize(results);
  if (reportPath) {
    await Bun.write(reportPath, report + "\n");
  }
  console.log(report);
}

if (import.meta.main) {
  await main();
}
