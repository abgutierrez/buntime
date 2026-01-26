# Agent Instructions for python-ipc-bun

This repo implements a kernel-level sandbox and IPC system where Bun is the
supervisor and Python is the untrusted worker. Follow these rules unless a task
explicitly says otherwise.

## Architecture Overview

- **Supervisor (Bun)**: lifecycle, policy enforcement, network proxy.
- **Worker (Python)**: executes untrusted code in Linux namespaces or raw process.
- **Data plane**: shared memory ring buffer via `bun:ffi`.
- **Control plane**: Unix domain sockets for READY/DATA/STOP signaling.

## Commands

### Install & Build
```bash
bun install
gcc -shared -o libshm.so -fPIC src/shm.c -lrt  # Required for shared memory
```

### Run
```bash
bun src/main.ts                        # Local run
bun --hot ./src/main.ts                # Watch mode
POLICY_FILE=src/policies/no-network.json bun src/main.ts  # With policy
```

### Docker (Linux-only IPC)
```bash
bun run app:docker                     # Docker Compose (preferred)
bun run app:docker:watch               # Watch mode
```

### Testing
```bash
bun test                               # All tests
bun test src/tests/ipc/server.test.ts  # Single file
bun test -t "pattern"                  # Pattern match
bun run test:docker                    # Docker integration tests
```

### CLI Usage
```bash
bunx python-ipc-bun run --allow-net=github.com main.ts
bunx python-ipc-bun init-policy --allow-read=/tmp > my-policy.json
```

## Code Style and Conventions

### General
- **Indentation**: 2 spaces.
- **Semicolons**: Always.
- **Quotes**: Double quotes preferred.
- **Imports**: ESM only. Group by origin (built-in, external, internal). Use named imports.
- **Types**: Strict TypeScript. No `any`, `@ts-ignore`, or `@ts-expect-error`.

### Naming
- **Classes/Types**: PascalCase (`IPCServer`, `PolicyLoader`).
- **Functions/Vars**: camelCase (`startWorker`, `sharedMemory`).
- **Constants**: UPPER_SNAKE_CASE (`DEFAULT_TIMEOUT`).
- **Filenames**: kebab-case (`ipc-server.ts`).

### Error Handling & Logging
- Use `try/catch` with specific error types.
- Log with consistent prefixes:
  - `[Bun]` Supervisor lifecycle
  - `[Python]` Worker logs
  - `[Audit]` Security events
  - `[CLI]` Entrypoint logs
- Avoid empty catch blocks.

### Bun-Native APIs (Mandatory)
- **HTTP**: `Bun.serve()` (no Express/Hono).
- **File**: `Bun.file()`, `Bun.write()`.
- **Shell**: `Bun.$`.
- **FFI**: `bun:ffi` for C bindings.
- **Tests**: `bun:test`.

## Repository Layout

- `src/`
  - `ipc/`: Shared memory and socket logic.
  - `sandbox/`: Linux namespace and policy enforcement.
  - `policies/`: JSON security policies.
  - `debug-ui/`: Web interface for inspection.
  - `tests/`: Bun test files.
- `example/`: Policy matrix and benchmarks.
- `libshm.so`: Compiled shared memory library.

## Python Integration
- Uses `multiprocessing.shared_memory`.
- Framing: `[u32 len][payload]`.
- Style: PEP8, snake_case.

## Cursor/Copilot Rules
- No Cursor rules found.
- No Copilot instructions found.
