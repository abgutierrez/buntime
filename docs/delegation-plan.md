# Delegation Plan: Pod/Runner Architecture and Refactor

This plan lists multi-agent research and verification tasks required before
implementation. It focuses on architecture, CLI, Docker, and example/UI separation.

## 1) Runner Extraction and Interface Design

- Goal: Define a clean Runner class that encapsulates a single execution unit.
- Agent: explore
- Scope: `src/ipc/server.ts`, `src/ipc/ringbuffer.ts`, `src/sandbox/launcher.ts`
- Prompt:
  - Draft a TypeScript interface for a Runner class extracted from IPCServer.
  - Include state: id, status, shmName, socketPath, pids, ringBuffers.
  - Include methods: prepare(), launch(policy), send(data), interrupt(), stop(), cleanup().
  - Include events: onStateChange, onOutput, onAudit.
  - Map where current IPCServer logic corresponds to each method.
- Output: markdown spec of Runner interface with mapping notes.

## 2) Pod Manager and Resource Tracking

- Goal: Design the Pod manager to oversee multiple runners and prevent leaks.
- Agent: explore
- Scope: `src/ipc/`, `src/sandbox/`
- Prompt:
  - Design a Pod class as a factory/registry for Runners.
  - Address SHM name generation (<31 chars) and socket path strategy.
  - Track runners in Map<string, Runner>.
  - Orphan cleanup: audit `/dev/shm` on startup for stale segments.
  - Global shutdown: signal handling for cleanup.
- Output: Pod design doc with resource lifecycle details.

## 3) CLI Flag Mapping (Deno-style)

- Goal: Map CLI flags to policy schema and build transient policies.
- Agent: oracle
- Scope: `src/sandbox/policy/loader.ts`, `src/sandbox/policy/set.ts`
- Prompt:
  - Map flags to policy schema: allow/deny for net, read, write, env, run, ffi, sys.
  - Define a TransientPolicyBuilder that converts `Bun.argv` into a policy object.
  - Ensure deny overrides allow; CLI overrides default policy.
- Output: mapping table and pseudocode for TransientPolicyBuilder.

## 4) UI and Supervisor Core Decoupling

- Goal: Move UI out of the core supervisor.
- Agent: explore
- Scope: `src/main.ts`, `src/public/`
- Prompt:
  - Identify all UI-specific logic in `src/main.ts`.
  - Draft a UIServer class wrapping `Bun.serve` and WebSocket handlers.
  - Define event interface between Supervisor core and UIServer.
  - Move example catalog to a UI-only module.
- Output: refactor checklist and Core <-> UI event interface.

## 5) Docker Multi-stage Strategy

- Goal: Produce a lean production image with Bun + Python + libshm.so.
- Agent: librarian
- Scope: `Dockerfile`, `src/shm.c`
- Prompt:
  - Draft a multi-stage Dockerfile (builder + runtime).
  - Builder compiles `libshm.so` and installs Bun deps.
  - Runtime is minimal base image; installs Bun runtime.
  - Document runtime dependencies and `--privileged` requirements.
- Output: Dockerfile draft plus runtime dependency list.

## 6) Telemetry and Audit Buffer Extraction

- Goal: Move audit batching logic out of the main entry point.
- Agent: explore
- Scope: `src/main.ts`, `src/sandbox/telemetry/`
- Prompt:
  - Extract telemetry batching into a TelemetryAggregator.
  - Inputs: raw audit events. Outputs: formatted payloads for UI.
  - Maintain broadcast intervals (200ms) and audit batching (250ms).
- Output: TelemetryAggregator class definition.

## 7) Example Reorganization and Path Updates

- Goal: Move examples to top-level `example/` and update references.
- Agent: explore
- Scope: `src/examples/`, `package.json`, `src/main.ts`
- Prompt:
  - Identify all references to `src/examples/`.
  - Update scripts and docs to new paths.
  - Ensure bind-mount logic includes the new `example/` path.
- Output: file list with line references needing updates.

## Verification Criteria

- Parallelism: tasks 1-7 can run in parallel.
- Stopping condition: each agent returns a structured report with no open gaps.
- ASCII only.
