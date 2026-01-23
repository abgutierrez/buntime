const $ = Bun.$;

import type { BenchResult } from "./compare.ts";
import { runBench } from "./compare.ts";

type CoverageRow = {
  file: string;
  stmts: number;
  branch: number;
  funcs: number;
  lines: number;
};

type AveragedResult = {
  label: string;
  avgElapsedMs: number;
  avgInvocationsPerSec: number;
  iterations: number;
  exitCode: number;
  failures: number;
};

const iterationSizes = [10, 50, 100, 500];
const runsPerIteration = Number(process.env.BENCH_REPORT_RUNS ?? "1");
const reportPath = process.env.BENCH_REPORT_PATH ?? "example/bench/bench-report.md";

const comparisonPairs = [
  { left: "bun_worker_fs", right: "native_bun_fs" },
  { left: "bun_worker_net", right: "native_bun_net" },
];

function formatNumber(value: number, decimals = 2) {
  if (!Number.isFinite(value)) {
    return "n/a";
  }
  return value.toFixed(decimals);
}

function aggregateResults(results: BenchResult[]) {
  const aggregated = new Map<
    string,
    { elapsedSum: number; ipsSum: number; iterations: number; failures: number; maxExit: number; count: number }
  >();

  for (const result of results) {
    const current = aggregated.get(result.label) ?? {
      elapsedSum: 0,
      ipsSum: 0,
      iterations: result.iterations,
      failures: 0,
      maxExit: 0,
      count: 0,
    };
    current.elapsedSum += result.elapsedMs;
    current.ipsSum += result.invocationsPerSec;
    current.iterations = result.iterations;
    current.failures += result.exitCode === 0 ? 0 : 1;
    current.maxExit = Math.max(current.maxExit, result.exitCode);
    current.count += 1;
    aggregated.set(result.label, current);
  }

  const averaged: AveragedResult[] = [];
  for (const [label, data] of aggregated) {
    averaged.push({
      label,
      avgElapsedMs: data.elapsedSum / data.count,
      avgInvocationsPerSec: data.ipsSum / data.count,
      iterations: data.iterations,
      exitCode: data.maxExit,
      failures: data.failures,
    });
  }

  return averaged.sort((a, b) => a.label.localeCompare(b.label));
}

function comparisonsFor(results: AveragedResult[]) {
  const lines: string[] = [];
  const byLabel = new Map(results.map((result) => [result.label, result]));

  for (const pair of comparisonPairs) {
    const left = byLabel.get(pair.left);
    const right = byLabel.get(pair.right);
    if (!left || !right) {
      continue;
    }
    const faster = left.avgElapsedMs <= right.avgElapsedMs ? left : right;
    const slower = faster === left ? right : left;
    const ratio = slower.avgElapsedMs / faster.avgElapsedMs;
    lines.push(
      `- \`${faster.label}\` is x${formatNumber(ratio)} faster than \`${slower.label}\` (${formatNumber(
        faster.avgElapsedMs,
      )} ms vs ${formatNumber(slower.avgElapsedMs)} ms)`,
    );
  }

  return lines;
}

function parseCoverageTable(raw: string): CoverageRow[] {
  const rows: CoverageRow[] = [];
  const lines = raw.split("\n").map((line) => line.trim()).filter(Boolean);

  const pipeRows = lines.filter((line) => line.includes("|"));
  for (const line of pipeRows) {
    const parts = line
      .split("|")
      .map((part) => part.trim())
      .filter(Boolean);
    if (parts.length < 5) {
      continue;
    }
    const file = parts[0];
    if (!file || file === "File" || file === "All files" || file.startsWith("---")) {
      continue;
    }
    const stmts = Number(parts[1]);
    const branch = Number(parts[2]);
    const funcs = Number(parts[3]);
    const linesPct = Number(parts[4]);
    if ([stmts, branch, funcs, linesPct].some((value) => Number.isNaN(value))) {
      continue;
    }
    rows.push({ file, stmts, branch, funcs, lines: linesPct });
  }

  if (rows.length > 0) {
    return rows;
  }

  for (const line of lines) {
    const match = line.match(
      /^(\S+)\s+(\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)/,
    );
    if (!match) {
      continue;
    }
    const file = match[1];
    if (!file || file === "File" || file === "All" || file === "All files") {
      continue;
    }
    rows.push({
      file,
      stmts: Number(match[2]),
      branch: Number(match[3]),
      funcs: Number(match[4]),
      lines: Number(match[5]),
    });
  }

  return rows;
}

async function runCoverage() {
  const proc = await $`bun test --coverage`.nothrow();
  const stdout = proc.stdout.toString();
  const stderr = proc.stderr.toString();
  const rows = parseCoverageTable(stdout + "\n" + stderr);
  return {
    rows,
    exitCode: proc.exitCode ?? 1,
    raw: stdout + "\n" + stderr,
  };
}

function formatCoverageSection(coverage: { rows: CoverageRow[]; exitCode: number; raw: string }) {
  if (coverage.exitCode !== 0) {
    return [
      "## Coverage",
      "",
      `Coverage collection failed with exit code ${coverage.exitCode}.`,
      "",
      "```",
      coverage.raw.trim(),
      "```",
    ].join("\n");
  }

  if (coverage.rows.length === 0) {
    return [
      "## Coverage",
      "",
      "Coverage data was not parsed from `bun test --coverage` output.",
      "",
      "```",
      coverage.raw.trim(),
      "```",
    ].join("\n");
  }

  const sorted = [...coverage.rows].sort((a, b) => a.file.localeCompare(b.file));
  const lines = [
    "## Coverage",
    "",
    "| File | % Stmts | % Branch | % Funcs | % Lines |",
    "| --- | --- | --- | --- | --- |",
  ];
  for (const row of sorted) {
    lines.push(
      `| \`${row.file}\` | ${formatNumber(row.stmts)} | ${formatNumber(row.branch)} | ${formatNumber(
        row.funcs,
      )} | ${formatNumber(row.lines)} |`,
    );
  }

  return lines.join("\n");
}

async function runBenchForIterations(iterations: number) {
  const overrides = {
    BENCH_ITER_FS: String(iterations),
    BENCH_ITER_NET: String(iterations),
    BENCH_ITER_FS_STRESS: String(iterations),
    BENCH_ITER_NET_STRESS: String(iterations),
  };

  const runs: BenchResult[] = [];
  for (let index = 0; index < runsPerIteration; index += 1) {
    const results = await runBench(overrides, { log: false });
    runs.push(...results);
  }

  return aggregateResults(runs);
}

function formatBenchSection(iterations: number, results: AveragedResult[]) {
  const lines = [
    `## Iterations: ${iterations}`,
    "",
    "| Scenario | Avg ms | Iterations | Avg IPS | Exit | Failures |",
    "| --- | --- | --- | --- | --- | --- |",
  ];

  for (const result of results) {
    lines.push(
      `| \`${result.label}\` | ${formatNumber(result.avgElapsedMs)} | ${result.iterations} | ${formatNumber(
        result.avgInvocationsPerSec,
      )} | ${result.exitCode} | ${result.failures} |`,
    );
  }

  const comparisons = comparisonsFor(results);
  if (comparisons.length > 0) {
    lines.push("", "**Relative comparisons**", ...comparisons);
  }

  return lines.join("\n");
}

function formatHeader() {
  return [
    "# Benchmark Report",
    "",
    `Generated: ${new Date().toISOString()}`,
    "",
    `Runs per iteration size: ${runsPerIteration}`,
    `Iteration sizes: ${iterationSizes.join(", ")}`,
    "",
    "Notes:",
    "- Iteration sizes are applied to all benchmark scenarios (including stress labels).",
    "- Relative comparisons use average elapsed time (lower is faster).",
  ].join("\n");
}

if (import.meta.main) {
  const benchSections: string[] = [];

  for (const iterations of iterationSizes) {
    const results = await runBenchForIterations(iterations);
    benchSections.push(formatBenchSection(iterations, results));
  }

  const coverage = await runCoverage();
  const coverageSection = formatCoverageSection(coverage);

  const report = [formatHeader(), "", "## Benchmarks", "", ...benchSections, "", coverageSection].join(
    "\n",
  );

  await Bun.write(reportPath, report + "\n");
  console.log(`[Bench] Wrote report to ${reportPath}`);
}
