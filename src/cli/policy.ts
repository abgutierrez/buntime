import { isIP } from "node:net";
import type { Policy, NetRule, FsRule, ExecRule } from "../sandbox/policy/loader";

export interface CliPolicyFlags {
  allowRead?: string[] | null;
  denyRead?: string[] | null;
  allowWrite?: string[] | null;
  denyWrite?: string[] | null;
  allowNet?: string[] | null;
  denyNet?: string[] | null;
  allowRun?: string[] | null;
  denyRun?: string[] | null;
  allowAll?: boolean;
  allowEnv?: string[] | null;
  denyEnv?: string[] | null;
  allowFfi?: string[] | null;
  denyFfi?: string[] | null;
  allowSys?: string[] | null;
  denySys?: string[] | null;
}

export interface NetworkOverrides {
  allowHosts: string[];
  denyHosts: string[];
  allowAll: boolean;
  denyAll: boolean;
}

export interface PolicyBuildResult {
  policy: Policy | null;
  warnings: string[];
  network: NetworkOverrides;
}

const READ_PERMS: FsRule["perms"] = ["read_file", "read_dir"];
const WRITE_PERMS: FsRule["perms"] = ["write_file", "write_dir"];

const DEFAULT_POLICY: Policy = {
  version: 1,
  plugins: { namespaces: true, landlock: true, seccomp: true },
  defaults: { fs: "deny", net: "deny", exec: "deny" },
};

export function buildPolicyFromFlags(
  flags: CliPolicyFlags,
  strictDefault: boolean,
): PolicyBuildResult {
  const warnings: string[] = [];
  const fsRules: FsRule[] = [];
  const netRules: NetRule[] = [];
  const execRules: ExecRule[] = [];
  const network: NetworkOverrides = {
    allowHosts: [],
    denyHosts: [],
    allowAll: false,
    denyAll: false,
  };

  const hasFs =
    flags.allowRead != null ||
    flags.denyRead != null ||
    flags.allowWrite != null ||
    flags.denyWrite != null;
  const hasNet = flags.allowNet != null || flags.denyNet != null;
  const hasExec = flags.allowRun != null || flags.denyRun != null;

  if (!strictDefault && !hasFs && !hasNet && !hasExec && !flags.allowAll) {
    return { policy: null, warnings, network };
  }

  const policy: Policy = JSON.parse(JSON.stringify(DEFAULT_POLICY));

  if (flags.allowAll) {
    policy.defaults = { fs: "allow", net: "allow", exec: "allow" };
    network.allowAll = true;
  }

  if (flags.allowRead) {
    if (flags.allowRead.length === 0) {
      policy.defaults.fs = "allow";
    } else {
      for (const path of flags.allowRead) {
        fsRules.push({ action: "allow", path, perms: READ_PERMS });
      }
    }
  }

  if (flags.denyRead) {
    if (flags.denyRead.length === 0) {
      policy.defaults.fs = "deny";
    } else {
      for (const path of flags.denyRead) {
        fsRules.push({ action: "deny", path, perms: READ_PERMS });
      }
    }
  }

  if (flags.allowWrite) {
    if (flags.allowWrite.length === 0) {
      policy.defaults.fs = "allow";
    } else {
      for (const path of flags.allowWrite) {
        fsRules.push({ action: "allow", path, perms: WRITE_PERMS });
      }
    }
  }

  if (flags.denyWrite) {
    if (flags.denyWrite.length === 0) {
      policy.defaults.fs = "deny";
    } else {
      for (const path of flags.denyWrite) {
        fsRules.push({ action: "deny", path, perms: WRITE_PERMS });
      }
    }
  }

  if (flags.allowRun) {
    if (flags.allowRun.length === 0) {
      policy.defaults.exec = "allow";
    } else {
      for (const path of flags.allowRun) {
        execRules.push({ action: "allow", path });
      }
    }
  }

  if (flags.denyRun) {
    if (flags.denyRun.length === 0) {
      policy.defaults.exec = "deny";
    } else {
      for (const path of flags.denyRun) {
        execRules.push({ action: "deny", path });
      }
    }
  }

  if (flags.allowNet) {
    if (flags.allowNet.length === 0) {
      policy.defaults.net = "allow";
      network.allowAll = true;
    } else {
      for (const entry of flags.allowNet) {
        addNetEntry(netRules, network.allowHosts, entry, "allow");
      }
    }
  }

  if (flags.denyNet) {
    if (flags.denyNet.length === 0) {
      policy.defaults.net = "deny";
      network.denyAll = true;
    } else {
      for (const entry of flags.denyNet) {
        addNetEntry(netRules, network.denyHosts, entry, "deny");
      }
    }
  }

  if (flags.allowEnv || flags.denyEnv) {
    warnings.push("Env permissions are not enforced by the current runtime.");
  }
  if (flags.allowFfi || flags.denyFfi) {
    warnings.push("FFI permissions are not enforced by the current runtime.");
  }
  if (flags.allowSys || flags.denySys) {
    warnings.push("System info permissions are not enforced by the current runtime.");
  }

  if (fsRules.length) policy.fs = { rules: fsRules };
  if (netRules.length) policy.net = { rules: netRules };
  if (execRules.length) policy.exec = { rules: execRules };

  return { policy, warnings, network };
}

function addNetEntry(
  rules: NetRule[],
  hosts: string[],
  raw: string,
  action: "allow" | "deny",
) {
  const { host, port, cidr } = parseNetTarget(raw);
  if (cidr) {
    rules.push({
      action,
      proto: "tcp",
      cidr,
      ports: port ?? "0-65535",
    });
    return;
  }
  if (host) {
    hosts.push(host);
  }
}

function parseNetTarget(raw: string) {
  const trimmed = raw.trim();
  if (!trimmed) {
    return { host: null, port: null, cidr: null };
  }
  if (trimmed.includes("/")) {
    return { host: null, port: null, cidr: trimmed };
  }
  const withPort = splitHostPort(trimmed);
  if (withPort && isIP(withPort.host)) {
    return {
      host: null,
      port: withPort.port,
      cidr: `${withPort.host}/32`,
    };
  }
  if (isIP(trimmed)) {
    return { host: null, port: null, cidr: `${trimmed}/32` };
  }
  return {
    host: withPort?.host ?? trimmed,
    port: withPort?.port ?? null,
    cidr: null,
  };
}

function splitHostPort(value: string) {
  if (value.startsWith("[")) {
    const end = value.indexOf("]");
    if (end === -1) return null;
    const host = value.slice(1, end);
    const rest = value.slice(end + 1);
    if (rest.startsWith(":") && rest.length > 1) {
      return { host, port: rest.slice(1) };
    }
    return { host, port: null };
  }
  const parts = value.split(":");
  if (parts.length === 2 && parts[1]) {
    return { host: parts[0] ?? "", port: parts[1] };
  }
  return null;
}
