# Investigations and Ideas: Secure Bun Sandbox + IPC

This document captures the investigations so far and continues with two threads:

1. how a Bun permissions model could integrate into runtime APIs, and
2. use-case framing with clear boundaries.

All speculative content is marked as SPECULATIVE.

## Investigations Summary

- Repo architecture: Bun is the privileged supervisor; Python is the untrusted worker.
- Isolation is enforced by Linux namespaces, chroot, bind mounts, and planned seccomp/landlock.
- IPC uses Unix domain sockets for control and shared memory ring buffers for data.
- Policies are JSON allow/deny specs; Bun enforces policies before proxying or syscall checks.
- Telemetry uses eBPF tracing (bpftrace) for audit-only syscall visibility.

Key implementation surfaces investigated:

- `src/sandbox/launcher.ts`: namespace, chroot, mount, fork/exec via `bun:ffi`
- `src/ipc/server.ts`: IPC control plane + veth
- `src/ipc/ringbuffer.ts` and `src/worker.py`: shared memory ring buffer + policy hooks
- `src/proxy.ts`: HTTP/HTTPS proxy allowlist
- `src/sandbox/plugins/interface.ts`: plugin interface
- `src/sandbox/telemetry/ebpf.ts`: audit telemetry
- `src/policies/*.json`: policy inputs

## Option 1: Bun Permissions and Secure API Integration

### Current Bun security posture (documented)

- Bun does not provide a native permission model for filesystem or network.
- Bun does not provide kernel sandboxing (namespaces, seccomp, landlock).
- Workers provide JS runtime isolation only; they do not restrict OS access.

Evidence:

- Bun runtime docs for APIs like `Bun.serve()` and `Bun.build()` contain no permission controls.
- Open issues for permissions/sandbox support:[https://github.com/oven-sh/bun/issues/6617]
- AI sandboxing discussion: [https://github.com/oven-sh/bun/issues/25929]
- Bun shell safety guidance:[https://bun.com/docs/runtime/shell]
- Bun Workers: [https://bun.com/docs/runtime/workers]

### Integration idea

The core thesis is to layer a runtime permission model on top of a kernel-level sandbox.
Runtime checks provide early, user-facing errors and policy compliance; kernel checks
provide the hard boundary that cannot be bypassed by a compromised runtime.

Security layers:

- Runtime permission checks: enforce allow/deny before operations.
- Kernel sandboxing: namespaces, seccomp, landlock to contain escape vectors.
- Observability: audit via eBPF or seccomp-unotify (audit-only or enforce).

Where a hypothetical `Bun.sandbox()` might fit:

- `Bun.serve()` to scope request handlers
- `Bun.build()` to scope bundler file access
- `Bun.spawn()` to scope child processes
- `Worker` to scope JS workers with reduced privileges
- CLI entry points (`bun run`, `bun test`, `bunx`) to apply default policies

## Option 2: Use Cases and Boundaries

### Primary use cases

- Untrusted code execution (serverless / AI agent sandboxing).
- Multi-tenant data processing with strict network and filesystem policy.
- Security research / malware analysis with audit telemetry.
- CI plugin execution with least-privilege access to repo paths.

### Where it does not fit well

- Non-Linux platforms (namespaces + landlock are Linux-only).
- GPU or complex device pass-through (driver access is a large attack surface).
- Massive polyglot worker fleets where per-process namespace setup cost dominates.
- Strictly real-time workloads if audit tracing adds latency.

### Constraints to call out explicitly

- Kernel sandboxing must be treated as mandatory for hostile code.
- JS-level permission checks are insufficient without kernel backing.
- A safe default should be "deny-by-default" for net and filesystem.

## Tentative Secure Bun APIs (SPECULATIVE)

The APIs below are speculative designs. They show how secure policy might integrate
with Bun's existing runtime and CLI entry points. This is not an implementation plan.

### Policy object

```ts
// SPECULATIVE
const policy = Bun.sandbox({
  allow: {
    net: ["api.example.com:443"],
    read: ["./data"],
    write: ["/tmp/scratch"],
    env: ["NODE_ENV"],
  },
  deny: {
    net: ["10.0.0.0/8", "169.254.0.0/16"],
    read: ["/etc", "/proc"],
    exec: ["/bin/sh"],
  },
  kernel: {
    namespaces: ["pid", "mnt", "net"],
    seccomp: "default-deny",
    landlock: true,
    audit: "ebpf", // or "seccomp-unotify"
  },
});
```

### `Bun.serve()` with sandbox

```ts
// SPECULATIVE
Bun.serve({
  port: 3000,
  sandbox: policy,
  fetch(req) {
    // Handler is subject to policy
    return new Response("ok");
  },
});
```

### `Bun.build()` with sandbox

```ts
// SPECULATIVE
await Bun.build({
  entrypoints: ["./untrusted/index.ts"],
  outdir: "./dist",
  sandbox: policy,
});
```

### `Bun.spawn()` with sandbox

```ts
// SPECULATIVE
const proc = Bun.spawn(["python3", "worker.py"], {
  sandbox: policy,
  cwd: "/app",
});
```

### Workers with sandbox

```ts
// SPECULATIVE
const worker = new Worker("./worker.ts", {
  sandbox: policy,
});
```

### CLI entry points with sandbox

```bash
# SPECULATIVE
bun run --sandbox=policy.json src/main.ts
bun test --sandbox=policy.json
bunx --sandbox=policy.json some-cli
```

### Other ways to run secure Bun (SPECULATIVE)

- `Bun.serve({ sandbox })` for API handlers.
- `Bun.build({ sandbox })` for bundler file access and macros.
- `Bun.spawn({ sandbox })` for child process isolation.
- `Worker({ sandbox })` for in-process isolation boundary.
- CLI flag to apply default sandbox policy for all entry points.
- Optional "sandboxed mode" for `bun` runtime that denies net/fs by default.

## Open Questions

- Should `Bun.spawn()` inherit the caller policy or require an explicit subset?
- How to combine runtime policy checks with kernel enforcement without duplicating costs?
- What is the minimal cross-platform subset that can work without Linux features?
- How should policy be configured for bundled outputs created by `Bun.build()`?
- What is the performance impact of audit tracing on high-frequency syscalls?

## References

- Bun API docs (runtime): [ https://bun.com/docs/runtime/bun-apis]
- Bun server guide: [https://bun.com/docs/guides/http/simple]
- Bun bundler: [https://bun.com/docs/bundler/index]
- Bun macros (security model): [https://bun.com/docs/bundler/macros]
- Bun workers: [https://bun.com/docs/runtime/workers]
- Bun shell safety: [https://bun.com/docs/runtime/shell]
- Permissions feature request: [https://github.com/oven-sh/bun/issues/6617]
- Secure sandboxing discussion: [https://github.com/oven-sh/bun/issues/25929]
