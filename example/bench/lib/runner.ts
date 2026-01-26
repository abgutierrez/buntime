import { $ } from "bun";
import { type BenchConfig, parseBenchConfig } from "./config";

export interface Scenario {
  id: string;
  label: string;
  script: string;
  command: string;
  args: string[];
  env: Record<string, string>;
}

export interface BenchMeta {
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
}

export interface ScenarioStats {
  scenario: Scenario;
  avgMs: number;
  maxMs: number;
  runs: number;
  exitCode: number;
  meta: BenchMeta | null;
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

export async function runScenario(scenario: Scenario, runs: number = 3): Promise<ScenarioStats> {
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

export function printScenarioResult(stats: ScenarioStats) {
  console.log(
    `[Bench] ${stats.scenario.label} avg_ms=${stats.avgMs.toFixed(2)} max_ms=${stats.maxMs.toFixed(
      2,
    )} runs=${stats.runs} exit=${stats.exitCode}`,
  );
}

export function printSummary(results: ScenarioStats[]) {
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
}

export function printComparison(results: ScenarioStats[]) {
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
}
