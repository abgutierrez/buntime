import { join } from "path";
import {
  PolicyLoader,
  type NormalizedPolicy,
  type Policy,
} from "../sandbox/policy/loader";
import { PolicyEnforcer } from "../sandbox/policy/enforcer";
import { MsgType } from "../ipc/protocol";
import {
  buildOpenPolicy,
  buildPolicySetMeta,
  mergePolicies,
  validatePolicySetInput,
  type PolicySetMeta,
  type PolicySetSource,
} from "../sandbox/policy/set";
import { IPCServer } from "../ipc/server";
import { loadConfig, type SandboxConfig } from "../config";
import {
  EBPFAuditTelemetry,
  type AuditTelemetryEvent,
} from "../sandbox/telemetry/ebpf";

export type SupervisorEvent = {
  type: string;
  data?: any;
};

export interface SupervisorOptions {
  policyPath?: string;
  activePolicyPath?: string;
  activePolicyMetaPath?: string;
  shmSize?: number;
  workerType?: "python" | "bun";
  sandboxEnabled?: boolean;
}

const SYSCALL_BUCKETS = ["connect", "openat", "execve"] as const;
type SyscallBucket = (typeof SYSCALL_BUCKETS)[number];

export class Supervisor {
  private sockets = new Set<any>();
  private decoder = new TextDecoder();
  private activePolicy: NormalizedPolicy | null = null;
  private enforcer: PolicyEnforcer | null = null;
  private activePolicySetMeta: PolicySetMeta | null = null;
  private ipcServer: IPCServer | null = null;
  private policyPath: string;
  private activePolicyPath: string;
  private activePolicyMetaPath: string;
  private syscallBuckets = SYSCALL_BUCKETS;
  private syscallHeatmapSize = 20;
  private telemetry: EBPFAuditTelemetry | null = null;
  private syscallCounts = new Map<string, number>();
  private lastSyscallBroadcast = 0;
  private auditEventQueue: AuditTelemetryEvent[] = [];
  private maxAuditQueueSize = 200;
  private maxAuditBatchSize = 40;
  private auditBroadcastIntervalMs = 250;
  private auditFlushTimer: ReturnType<typeof setInterval> | null = null;
  private memoryTimer: ReturnType<typeof setInterval> | null = null;
  private listeners = new Set<(event: SupervisorEvent) => void>();
  private config: SandboxConfig | null = null;
  private shmSize: number;
  private workerType: "python" | "bun";
  private sandboxEnabled: boolean;

  constructor(options: SupervisorOptions = {}) {
    this.policyPath =
      options.policyPath || process.env.POLICY_FILE || "src/policies/default.json";
    this.activePolicyPath =
      options.activePolicyPath || join(process.cwd(), "src/policies/active.json");
    this.activePolicyMetaPath =
      options.activePolicyMetaPath ||
      join(process.cwd(), "src/policies/active.meta.json");
    this.shmSize = options.shmSize ?? 1024 * 1024;
    this.workerType = options.workerType ?? "python";
    this.sandboxEnabled = options.sandboxEnabled ?? true;
  }

  onEvent(listener: (event: SupervisorEvent) => void) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  getSnapshot() {
    return {
      policy: this.activePolicy,
      policyMeta: this.activePolicySetMeta,
    };
  }

  async start(configOverride?: Partial<SandboxConfig>) {
    this.config = await loadConfig();
    if (configOverride) {
      this.config = this.mergeConfigOverrides(this.config, configOverride);
    }

    this.emit({
      type: "config-loaded",
      data: this.config,
    });

    try {
      await this.loadPolicy(this.policyPath);
    } catch (error: any) {
      this.emit({
        type: "error",
        data: `Failed to initialize policy: ${error.message}`,
      });
    }

    await this.loadPolicySetMetaIfPresent();

    try {
      const shmName = "/bun_ipc_" + Math.random().toString(36).slice(2, 8);
      this.ipcServer = new IPCServer(shmName, this.shmSize, 
        (data) => {
          const text = new TextDecoder().decode(data);
          this.emit({ type: "output", data: text });
        },
        (type, payload) => this.handlePolicyCheck(type, payload)
      );

      this.ipcServer.setOnStateChange((state, signal, data) => {
        if (signal === "WORKER_EVENT" && state === "exec_start") {
          this.syscallCounts.clear();
          this.auditEventQueue.length = 0;
          this.lastSyscallBroadcast = 0;
          this.emit({ type: "syscalls", data: this.buildHeatmapPayload() });
          this.emit({ type: "audit-reset" });
        }
        this.emit({
          type: "state",
          data: { worker: state, signal, ...data },
        });
      });

      const workerCommand = this.buildWorkerCommand();
      await this.ipcServer.start(workerCommand, this.config, {
        env: { POLICY_PATH: this.activePolicyPath, PYTHONUNBUFFERED: "1" },
        sandboxEnabled: this.sandboxEnabled,
      });

      this.startMemoryLoop();
    } catch (error: any) {
      this.emit({
        type: "error",
        data: `IPC Server failed to start: ${error.message}`,
      });
    }
  }

  sendCode(code: string) {
    if (!this.ipcServer) {
      this.emit({ type: "error", data: "IPC server not ready" });
      return false;
    }
    const bytes = new TextEncoder().encode(code || "");
    const ok = this.ipcServer.sendOp(MsgType.CODE, bytes);
    if (ok) {
      this.emit({ type: "state", data: { bun: "Sending..." } });
      setTimeout(() => {
        this.emit({ type: "state", data: { bun: "Sent" } });
      }, 200);
      return true;
    }
    this.emit({ type: "error", data: "Ring buffer full" });
    return false;
  }

  interrupt() {
    this.ipcServer?.interrupt();
  }

  stop() {
    this.telemetry?.stop();
    this.stopAuditFlushLoop();
    if (this.memoryTimer) {
      clearInterval(this.memoryTimer);
      this.memoryTimer = null;
    }
    this.ipcServer?.stop();
  }

  async applyPolicySet(
    payload: { policies?: Policy[]; policy?: Policy; policyKeys?: string[] },
    source: PolicySetSource,
  ): Promise<PolicySetMeta> {
    const policyList = Array.isArray(payload.policies)
      ? payload.policies
      : payload.policy
        ? [payload.policy]
        : [];

    const validation = validatePolicySetInput(policyList, payload.policyKeys);
    if (!validation.ok) {
      throw new Error(validation.errors.join(" "));
    }

    let combinedPolicy: Policy;
    if (policyList.length === 0) {
      combinedPolicy = buildOpenPolicy();
    } else {
      const loader = new PolicyLoader();
      for (const policy of policyList) {
        loader.validatePolicy(policy);
      }
      combinedPolicy = mergePolicies(policyList);
    }

    const meta = buildPolicySetMeta(
      policyList,
      payload.policyKeys,
      combinedPolicy,
      source,
    );

    await Bun.write(this.activePolicyPath, JSON.stringify(combinedPolicy, null, 2));
    await Bun.write(this.activePolicyMetaPath, JSON.stringify(meta, null, 2));
    this.policyPath = this.activePolicyPath;
    await this.loadPolicy(this.policyPath, meta);
    return meta;
  }

  private handlePolicyCheck(type: MsgType, payload: Uint8Array): { allowed: boolean } {
    if (!this.enforcer) return { allowed: true };

    if (type === MsgType.FS_READ || type === MsgType.FS_WRITE || type === MsgType.LISTDIR) {
        const path = this.decoder.decode(payload);
        const perm = type === MsgType.FS_WRITE ? "write_file" : 
                     type === MsgType.LISTDIR ? "read_dir" : "read_file";
        const action = this.enforcer.checkFs(path, perm);
        if (action === "warn") {
            console.log(`[Audit] warn fs ${path}`);
            return { allowed: true };
        }
        return { allowed: action === "allow" };
    }

    if (type === MsgType.EXEC) {
        const path = this.decoder.decode(payload);
        const action = this.enforcer.checkExec(path);
        if (action === "warn") {
            console.log(`[Audit] warn exec ${path}`);
            return { allowed: true };
        }
        return { allowed: action === "allow" };
    }

    if (type === MsgType.NET_CONNECT) {
        try {
            const str = this.decoder.decode(payload);
            const parts = str.split(":");
            if (parts.length !== 2) return { allowed: false };
            const host = parts[0];
            const portStr = parts[1];
            if (!host || !portStr) return { allowed: false };
            const port = parseInt(portStr, 10);
            const action = this.enforcer.checkNet(host, port, "tcp");
            if (action === "warn") {
                console.log(`[Audit] warn net tcp ${host}:${port}`);
                return { allowed: true };
            }
            return { allowed: action === "allow" };
        } catch {
            return { allowed: false };
        }
    }

    return { allowed: false };
  }

  private emit(event: SupervisorEvent) {
    for (const listener of this.listeners) {
      listener(event);
    }
  }

  private buildWorkerCommand() {
    if (this.workerType === "bun") {
      const scriptPath = join(process.cwd(), "src/worker-bun.ts");
      return ["bun", scriptPath];
    }
    const scriptPath = join(process.cwd(), "src/worker.py");
    return ["python3", scriptPath];
  }

  private mergeConfigOverrides(
    base: SandboxConfig,
    override: Partial<SandboxConfig>,
  ): SandboxConfig {
    return {
      ...base,
      ...override,
      security: { ...base.security, ...override.security },
      network: { ...base.network, ...override.network },
      filesystem: { ...base.filesystem, ...override.filesystem },
      resources: { ...base.resources, ...override.resources },
    };
  }

  private async loadPolicy(path: string, meta?: PolicySetMeta | null) {
    const loader = new PolicyLoader();
    this.activePolicy = await loader.load(path);
    if (this.activePolicy) {
        this.enforcer = new PolicyEnforcer(this.activePolicy);
    }
    if (this.activePolicy?.audit?.enabled) {
      this.emit({
        type: "audit-enabled",
        data: this.activePolicy.audit.events || [],
      });
    }
    await this.configureTelemetry(this.activePolicy);
    if (meta) {
      this.activePolicySetMeta = meta;
    }
    this.emit({ type: "policy-loaded", data: this.activePolicy });
    if (this.activePolicySetMeta) {
      this.emit({ type: "policy-set-loaded", data: this.activePolicySetMeta });
    }
  }

  private buildHeatmapPayload() {
    const counts: number[] = new Array(this.syscallHeatmapSize).fill(0);
    const buckets: string[] = new Array(this.syscallHeatmapSize).fill("");
    this.syscallBuckets.forEach((name, index) => {
      counts[index] = this.syscallCounts.get(name) || 0;
      buckets[index] = name;
    });
    return { buckets, counts };
  }

  private onTelemetryEvent(event: AuditTelemetryEvent) {
    const prev = this.syscallCounts.get(event.syscall) || 0;
    this.syscallCounts.set(event.syscall, prev + 1);
    const now = Date.now();
    if (now - this.lastSyscallBroadcast > 200) {
      this.lastSyscallBroadcast = now;
      this.emit({ type: "syscalls", data: this.buildHeatmapPayload() });
    }

    if (this.auditEventQueue.length >= this.maxAuditQueueSize) {
      this.auditEventQueue.shift();
    }
    this.auditEventQueue.push(event);
  }

  private flushAuditEvents() {
    if (!this.auditEventQueue.length) return;
    const batch = this.auditEventQueue.splice(0, this.maxAuditBatchSize);
    this.emit({ type: "audit-events", data: batch });
  }

  private startAuditFlushLoop() {
    if (this.auditFlushTimer) return;
    this.auditFlushTimer = setInterval(
      () => this.flushAuditEvents(),
      this.auditBroadcastIntervalMs,
    );
  }

  private stopAuditFlushLoop() {
    if (!this.auditFlushTimer) return;
    clearInterval(this.auditFlushTimer);
    this.auditFlushTimer = null;
  }

  private async configureTelemetry(policy: NormalizedPolicy | null) {
    if (!policy?.audit?.enabled) {
      this.telemetry?.stop();
      this.stopAuditFlushLoop();
      return;
    }
    const events = (policy.audit.events || []).filter((event) =>
      this.syscallBuckets.includes(event as SyscallBucket),
    ) as SyscallBucket[];

    if (!events.length) {
      this.telemetry?.stop();
      this.stopAuditFlushLoop();
      return;
    }

    if (!this.telemetry) {
      this.telemetry = new EBPFAuditTelemetry();
      this.telemetry.onEvent((event) => this.onTelemetryEvent(event));
    } else {
      this.telemetry.stop();
    }
    await this.telemetry.start(events);
    this.startAuditFlushLoop();
  }

  private async loadPolicySetMetaIfPresent() {
    const file = Bun.file(this.activePolicyMetaPath);
    if (!(await file.exists())) return null;
    try {
      const meta = (await file.json()) as PolicySetMeta;
      this.activePolicySetMeta = meta;
      if (this.activePolicySetMeta) {
        this.emit({ type: "policy-set-loaded", data: this.activePolicySetMeta });
      }
      return meta;
    } catch (error) {
      this.emit({ type: "warn", data: `Failed to load policy metadata: ${error}` });
      return null;
    }
  }

  private startMemoryLoop() {
    if (this.memoryTimer) return;
    this.memoryTimer = setInterval(() => {
      if (!this.ipcServer) return;
      const mem = this.ipcServer.getMemoryState();
      this.emit({ type: "memory", data: mem });
    }, 100);
  }
}
