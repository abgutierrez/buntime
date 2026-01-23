type AuditEventName = "connect" | "openat" | "execve";

export interface AuditTelemetryEvent {
    timestamp: number;
    syscall: AuditEventName;
    pid: number;
    comm: string;
    target?: string;
}

type TelemetryListener = (event: AuditTelemetryEvent) => void;

function buildScript(events: AuditEventName[]) {
    const lines: string[] = [];
    if (events.includes("connect")) {
        lines.push(
            "tracepoint:syscalls:sys_enter_connect { printf(\"connect pid=%d comm=%s\\n\", pid, comm); }",
        );
    }
    if (events.includes("openat")) {
        lines.push(
            "tracepoint:syscalls:sys_enter_openat { printf(\"openat pid=%d comm=%s path=%s\\n\", pid, comm, str(args->filename)); }",
        );
    }
    if (events.includes("execve")) {
        lines.push(
            "tracepoint:syscalls:sys_enter_execve { printf(\"execve pid=%d comm=%s path=%s\\n\", pid, comm, str(args->filename)); }",
        );
    }
    return lines.join("\n");
}

export class EBPFAuditTelemetry {
    private proc: ReturnType<typeof Bun.spawn> | null = null;
    private listeners = new Set<TelemetryListener>();
    private buffer = "";
    private active = false;

    onEvent(listener: TelemetryListener) {
        this.listeners.add(listener);
        return () => this.listeners.delete(listener);
    }

    async start(events: AuditEventName[]) {
        if (this.active) return;
        if (process.platform !== "linux") {
            console.warn("[Audit] eBPF telemetry is only available on Linux.");
            return;
        }
        const toolPath = Bun.which("bpftrace");
        if (!toolPath) {
            console.warn("[Audit] bpftrace not found; eBPF telemetry disabled.");
            return;
        }
        if (!events.length) {
            console.warn("[Audit] No audit events configured; telemetry disabled.");
            return;
        }

        const script = buildScript(events);
        this.proc = Bun.spawn({
            cmd: [toolPath, "-e", script],
            stdout: "pipe",
            stderr: "pipe",
        });
        this.active = true;

        if (this.proc.stderr) {
            this.consumeStream(this.proc.stderr, (line) => {
                console.warn(`[Audit] bpftrace: ${line}`);
            });
        }
        if (this.proc.stdout) {
            this.consumeStream(this.proc.stdout, (line) => {
                const match = line.match(/^(\w+) pid=(\d+) comm=([^\s]+)(?: path=(.*))?$/);
                if (!match) return;
                const syscall = match[1] as AuditEventName;
                const pid = Number(match[2]);
                const comm = match[3];
                const target = match[4];
                const event: AuditTelemetryEvent = {
                    timestamp: Date.now(),
                    syscall,
                    pid,
                    comm,
                    target,
                };
                for (const listener of this.listeners) {
                    listener(event);
                }
            });
        }
    }

    stop() {
        if (!this.proc) return;
        try {
            this.proc.kill("SIGINT");
        } catch {}
        this.proc = null;
        this.active = false;
        this.buffer = "";
    }

    private async consumeStream(
        stream: ReadableStream<Uint8Array>,
        onLine: (line: string) => void,
    ) {
        const reader = stream.getReader();
        const decoder = new TextDecoder();
        while (true) {
            const result = await reader.read();
            if (result.done) break;
            this.buffer += decoder.decode(result.value, { stream: true });
            let index = this.buffer.indexOf("\n");
            while (index !== -1) {
                const line = this.buffer.slice(0, index).trim();
                if (line.length) onLine(line);
                this.buffer = this.buffer.slice(index + 1);
                index = this.buffer.indexOf("\n");
            }
        }
    }
}
