#!/usr/bin/env bun
import { join } from "path";
import { Supervisor } from "./supervisor/supervisor";
import { PolicyLoader, type Policy } from "./sandbox/policy/loader";
import {
  buildPolicySetMeta,
  mergePolicies,
  type PolicySetSource,
} from "./sandbox/policy/set";
import {
  buildPolicyFromFlags,
  type CliPolicyFlags,
} from "./cli/policy";
import { startDebugUi } from "../example/debug-ui/server";
import type { SandboxConfig } from "./config";

type Command = "run" | "init-policy" | "help";

interface ParsedArgs {
  command: Command;
  entry?: string;
  entryArgs: string[];
  flags: CliFlags;
}

interface CliFlags extends CliPolicyFlags {
  policyPath?: string;
  shmSize?: number;
  workerType?: "python" | "bun";
  debugUi?: boolean;
  noSandbox?: boolean;
  output?: string;
}

const DEFAULT_ACTIVE_POLICY = join(
  process.cwd(),
  "src/policies/active.json",
);
const DEFAULT_ACTIVE_META = join(
  process.cwd(),
  "src/policies/active.meta.json",
);

const args = parseArgs(Bun.argv.slice(2));

switch (args.command) {
  case "run":
    await runCommand(args);
    break;
  case "init-policy":
    await initPolicyCommand(args);
    break;
  default:
    printUsage();
    process.exit(1);
}

async function runCommand(parsed: ParsedArgs) {
  if (!parsed.entry) {
    console.error("Missing entry file.");
    printUsage();
    process.exit(1);
  }

  const entryPath = join(process.cwd(), parsed.entry);
  const code = await Bun.file(entryPath).text();

  const { policy, warnings, network } = buildPolicyFromFlags(parsed.flags, true);
  for (const warning of warnings) {
    console.warn(`[CLI] ${warning}`);
  }

  const policies: Policy[] = [];
  if (parsed.flags.policyPath) {
    const loader = new PolicyLoader();
    const policyFile = Bun.file(parsed.flags.policyPath);
    if (!(await policyFile.exists())) {
      console.error(`[CLI] Policy file not found: ${parsed.flags.policyPath}`);
      process.exit(1);
    }
    const filePolicy = (await policyFile.json()) as Policy;
    loader.validatePolicy(filePolicy);
    policies.push(filePolicy);
  }
  if (policy) {
    policies.push(policy);
  }

  const source: PolicySetSource = "boot";
  const combinedPolicy: Policy = policies.length
    ? mergePolicies(policies)
    : {
        version: 1 as const,
        plugins: { namespaces: true, landlock: true, seccomp: true },
        defaults: { fs: "deny", net: "deny", exec: "deny" },
      };

  const meta = buildPolicySetMeta(
    policies,
    parsed.flags.policyPath ? ["policy-file", "cli-flags"] : ["cli-flags"],
    combinedPolicy,
    source,
  );

  await Bun.write(DEFAULT_ACTIVE_POLICY, JSON.stringify(combinedPolicy, null, 2));
  await Bun.write(DEFAULT_ACTIVE_META, JSON.stringify(meta, null, 2));

  const configOverride: Partial<SandboxConfig> = {
    network: {
      allow_list: network.allowAll
        ? ["*"]
        : network.allowHosts.length
          ? network.allowHosts
          : [],
      deny_list: network.denyAll
        ? ["*"]
        : network.denyHosts.length
          ? network.denyHosts
          : [],
      enabled: true,
      policy: "allow_list",
      rate_limit: 5,
    },
  };

  const supervisor = new Supervisor({
    policyPath: DEFAULT_ACTIVE_POLICY,
    activePolicyPath: DEFAULT_ACTIVE_POLICY,
    activePolicyMetaPath: DEFAULT_ACTIVE_META,
    shmSize: parsed.flags.shmSize,
    workerType: parsed.flags.workerType ?? "python",
    sandboxEnabled: !parsed.flags.noSandbox,
  });

  supervisor.onEvent((event) => {
    if (event.type === "output") {
      process.stdout.write(event.data ?? "");
    }
    if (event.type === "error") {
      console.error(`[Supervisor] ${event.data}`);
    }
  });

  await supervisor.start(configOverride);

  if (parsed.flags.debugUi) {
    startDebugUi(supervisor, {});
  }

  const ready = waitForState(supervisor, (data) => data?.signal === "READY");
  await ready;

  supervisor.sendCode(code);

  const finalState = await waitForState(
    supervisor,
    (data) =>
      ["exec_end", "exception", "interrupted"].includes(data?.worker),
    120000,
  );

  supervisor.stop();

  const exitCode =
    finalState?.data?.exitCode ??
    finalState?.data?.exit_code ??
    finalState?.exitCode ??
    finalState?.exit_code;
  if (exitCode !== undefined) {
    process.exit(exitCode);
  }

  if (finalState?.worker !== "exec_end") {
    process.exit(1);
  }
}

async function initPolicyCommand(parsed: ParsedArgs) {
  const { policy, warnings } = buildPolicyFromFlags(parsed.flags, true);
  for (const warning of warnings) {
    console.warn(`[CLI] ${warning}`);
  }
  if (!policy) {
    console.error("No policy flags provided.");
    process.exit(1);
  }
  const payload = JSON.stringify(policy, null, 2);
  if (parsed.flags.output) {
    await Bun.write(parsed.flags.output, payload);
    return;
  }
  process.stdout.write(payload + "\n");
}

function waitForState(
  supervisor: Supervisor,
  predicate: (data: any) => boolean,
  timeoutMs: number = 30000,
) {
  return new Promise<any>((resolve, reject) => {
    const timer = setTimeout(() => {
      unsubscribe();
      reject(new Error("Timed out waiting for worker state"));
    }, timeoutMs);
    const unsubscribe = supervisor.onEvent((event) => {
      if (event.type !== "state") return;
      if (predicate(event.data)) {
        clearTimeout(timer);
        unsubscribe();
        resolve(event.data);
      }
    });
  });
}

function parseArgs(args: string[]): ParsedArgs {
  const command = (args.shift() || "help") as Command;
  const flags: CliFlags = {};
  const entryArgs: string[] = [];
  let entry: string | undefined;

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (!arg) continue;
    if (arg === "--") {
      entry = args[i + 1];
      entryArgs.push(...args.slice(i + 2));
      break;
    }
    if (!arg.startsWith("--")) {
      entry = arg;
      entryArgs.push(...args.slice(i + 1));
      break;
    }
    const [name, value] = arg.split("=");
    const peek = args[i + 1];
    const nextValue = value ?? (peek && !peek.startsWith("--") ? args[++i] : undefined);

    switch (name) {
      case "--allow-net":
        flags.allowNet = parseList(nextValue);
        break;
      case "--deny-net":
        flags.denyNet = parseList(nextValue);
        break;
      case "--allow-read":
        flags.allowRead = parseList(nextValue);
        break;
      case "--deny-read":
        flags.denyRead = parseList(nextValue);
        break;
      case "--allow-write":
        flags.allowWrite = parseList(nextValue);
        break;
      case "--deny-write":
        flags.denyWrite = parseList(nextValue);
        break;
      case "--allow-run":
        flags.allowRun = parseList(nextValue);
        break;
      case "--deny-run":
        flags.denyRun = parseList(nextValue);
        break;
      case "--allow-env":
        flags.allowEnv = parseList(nextValue);
        break;
      case "--deny-env":
        flags.denyEnv = parseList(nextValue);
        break;
      case "--allow-ffi":
        flags.allowFfi = parseList(nextValue);
        break;
      case "--deny-ffi":
        flags.denyFfi = parseList(nextValue);
        break;
      case "--allow-sys":
        flags.allowSys = parseList(nextValue);
        break;
      case "--deny-sys":
        flags.denySys = parseList(nextValue);
        break;
      case "--allow-all":
        flags.allowAll = true;
        break;
      case "--policy":
        flags.policyPath = nextValue;
        break;
      case "--shm-size":
        flags.shmSize = parseSize(nextValue);
        break;
      case "--worker":
        flags.workerType = nextValue === "bun" ? "bun" : "python";
        break;
      case "--debug-ui":
        flags.debugUi = true;
        break;
      case "--no-sandbox":
        flags.noSandbox = true;
        break;
      case "--output":
        flags.output = nextValue;
        break;
      default:
        console.warn(`[CLI] Unknown flag: ${name}`);
    }
  }

  return {
    command,
    entry,
    entryArgs,
    flags,
  };
}

function parseList(value?: string) {
  if (value === undefined) return [];
  if (value === "") return [];
  return value.split(",").map((entry) => entry.trim()).filter(Boolean);
}

function parseSize(value?: string) {
  if (!value) return undefined;
  const normalized = value.trim().toLowerCase();
  const match = normalized.match(/^(\d+)(kb|mb|gb)?$/);
  if (!match) return undefined;
  const amount = Number(match[1]);
  const unit = match[2] || "b";
  const multiplier =
    unit === "kb" ? 1024 : unit === "mb" ? 1024 ** 2 : unit === "gb" ? 1024 ** 3 : 1;
  return amount * multiplier;
}

function printUsage() {
  console.log(`
buntime <command> [options]

Commands:
  run <entry>            Run a script inside the supervisor
  init-policy            Print a policy JSON built from flags

Examples:
  bunx buntime run --allow-net=github.com main.ts
  bunx buntime run --allow-read=/tmp --deny-net main.py
`);
}
