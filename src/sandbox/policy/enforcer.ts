import {
  type NormalizedPolicy,
  type Action,
  type FsPerm,
  type NormalizedNetRule,
} from "./loader";
import nodeCidr from "node-cidr";
import path from "path";

export class PolicyEnforcer {
  private policy: NormalizedPolicy;

  constructor(policy: NormalizedPolicy) {
    this.policy = policy;
  }

  public checkFs(targetPath: string, perm: FsPerm): Action {
    if (!this.policy.fs?.rules) {
      return this.policy.defaults.fs;
    }

    const absPath = path.resolve(targetPath);
    const actions: Action[] = [];

    for (const rule of this.policy.fs.rules) {
      if (absPath.startsWith(rule.path) && rule.perms.includes(perm)) {
        actions.push(rule.action);
      }
    }

    return this.resolveAction(actions, this.policy.defaults.fs);
  }

  public checkNet(ip: string, port: number, proto: "tcp" | "udp"): Action {
    if (!this.policy.net?.rules) {
      return this.policy.defaults.net;
    }

    const actions: Action[] = [];
    const rules = this.policy.net.rules;

    for (const rule of rules) {
      if (rule.proto !== proto) continue;
      
      if (!nodeCidr.cidr.includes(rule.cidr, ip)) continue;

      if (!this.portMatches(rule.ports, port)) continue;

      actions.push(rule.action);
    }

    return this.resolveAction(actions, this.policy.defaults.net);
  }

  public checkExec(cmdPath: string): Action {
    if (!this.policy.exec?.rules) {
      return this.policy.defaults.exec;
    }

    const actions: Action[] = [];
    for (const rule of this.policy.exec.rules) {
      if (rule.path === cmdPath) {
        actions.push(rule.action);
      }
    }

    return this.resolveAction(actions, this.policy.defaults.exec);
  }

  private resolveAction(actions: Action[], fallback: Action): Action {
    if (actions.includes("deny")) return "deny";
    if (actions.includes("warn")) return "warn";
    if (actions.includes("allow")) return "allow";
    return fallback;
  }

  private portMatches(ranges: NormalizedNetRule["ports"], port: number): boolean {
    for (const range of ranges) {
      if (port >= range.from && port <= range.to) {
        return true;
      }
    }
    return false;
  }
}
