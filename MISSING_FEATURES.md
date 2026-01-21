# Missing Features & Future Work

This document tracks planned features that are not yet implemented in the current version of the kernel-level sandbox.

## Phase E — Observability (eBPF Tracing)

- **Feature**: Implement an eBPF-based tracing backend (`observe.ebpf`).
- **Goal**: Provide a low-overhead, audit-only "flight recorder" for syscalls like `connect`, `sendto`, `execve`, and `openat`.
- **Use Case**:
    - Generate detailed audit logs for all security-relevant actions, even when not actively blocked by `seccomp-unotify`.
    - Build observability dashboards and metrics (e.g., top network destinations, most frequently accessed paths).
    - Act as a secondary validation layer or a fallback for observability if `seccomp-unotify` is disabled or unavailable.
- **Status**: Deferred. The priority is to complete the core enforcement mechanisms (Phases A-D) first.
