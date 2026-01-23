# Architecture Specification: Pod/Runner

## 1. Overview
The Pod/Runner is a security-first execution environment that implements a
"Supervisor-Worker" model. Bun acts as the trusted Supervisor (Runner). Workers
can be Bun, Python, or C-lib compatible services executed via child processes.

### Goals
- Isolation of untrusted worker code via Linux namespaces.
- High-performance IPC using Shared Memory Ring Buffers.
- Granular allow/deny/warn policy enforcement for Net/FS/Run/Env/FFI.
- Supervisor has full visibility into worker traffic via shared memory.
- Observability via eBPF-based syscall auditing.

### Scope
- Lifecycle management of sandboxed processes (Bun/Python/C-lib workers).
- IPC protocol definition and implementation.
- Policy evaluation, warnings, and enforcement decisions.
- Network proxying and allow/deny routing.

### Non-Goals
- Full Virtual Machine isolation (focused on Kernel-level sandboxing).
- Support for non-Linux production environments (Sandbox requires Linux).
- General-purpose container orchestration (focused on single worker isolation).

## 2. Components

### Supervisor (Bun)
- **Lifecycle Manager**: Spawns and monitors worker processes.
- **Policy Engine**: Loads and normalizes JSON security policies.
- **Policy Semaphore**: Decides allow/deny/warn for requested actions.
- **Network Proxy**: Acts as a transparent HTTP/HTTPS proxy for the worker.
- **Audit Collector**: Collects eBPF telemetry and logs security events.

### Worker (Bun/Python/C-lib)
- **Sandbox Wrapper**: Runs inside namespaces (mount, net, uts, pid).
- **IPC Client**: Communicates with the Supervisor via Shared Memory.
- **User Script/Service**: The actual untrusted code being executed.

## 3. Communication Planes

### Data Plane (Shared Memory)
- **Ring Buffer**: Dual-ring buffer for bi-directional binary data transfer.
- **Mechanism**: `shm_open` + `mmap` on Bun side, shared memory on worker side.
- **Framing**: `[u32 length][payload]` packets.

### Control Plane (Unix Sockets)
- **Signaling**: Out-of-band signaling for process state (`READY`, `STOP`, `DATA` notifications).
- **Socket Path**: Randomized UDS path passed to worker as a command-line argument.

## 4. Policy Flow
1. **Load**: Supervisor reads policy (JSON or CLI flags).
2. **Setup**: Supervisor configures Network Proxy and eBPF probes.
3. **Spawn**: Supervisor starts worker with a scrubbed environment.
4. **Monitor**:
   - Network: Redirected to Proxy (veth pair + iptables/nsenter).
   - Syscalls: Monitored via eBPF.
   - Filesystem: Restricted via bind mounts and chroot.
5. **Decide**: Supervisor applies allow/deny/warn for each request.
6. **Enforce**: Proxy and sandbox enforce decisions.

## 5. Refactor Plan

### UI Separation
- Treat UI as debug-only tooling.
- Move UI assets to `debug-ui/` (or `tools/ui/`) and gate behind `--debug-ui`.
- Core `run` command is headless and production-focused.

### Examples Refactor
- Move all logic in `src/examples` to `example/` at the repo root.
- Decouple example scripts from core `src/` to simplify packaging and runtime.

### Service Orchestration
- Formalize the "Pod" as the worker instance and "Runner" as the supervisor process.
