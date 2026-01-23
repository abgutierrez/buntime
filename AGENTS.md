# Agent Instructions for python-ipc-bun

This repo implements a kernel-level sandbox and IPC system where **Bun acts as the supervisor** and **Python acts as the untrusted worker**.
Follow these rules unless a task explicitly says otherwise.

## Architecture Overview

- **Supervisor (Bun)**: Manages lifecycle, enforces policies, proxies network traffic, and audits syscalls.
- **Worker (Python)**: Executes untrusted code within a Linux namespace sandbox (or raw process in dev).
- **Data Plane**: High-performance Shared Memory Ring Buffer (`src/ipc/ringbuffer.ts`) via `bun:ffi`.
- **Control Plane**: Unix Domain Sockets for signaling (`READY`, `DATA`, `STOP`).

## Commands

### Install
```bash
bun install
```

### Run (local)
```bash
bun src/main.ts
# Hot reload
bun --hot ./src/main.ts
```

### Run with policy (local)
```bash
POLICY_FILE=src/policies/no-network.json bun src/main.ts
```

### Scripts (package.json)
```bash
bun run app:docker
bun run app:docker:watch
bun run examples:matrix
bun run test:docker
bun run test:docker:watch
```

### Docker (Linux-only IPC)
```bash
docker build -t bun-ipc-demo .
docker run --rm --privileged -p 3000:3000 bun-ipc-demo
```

### Tests
```bash
bun test
# Single test file
bun test path/to/file.test.ts
# Tests matching a pattern
bun test -t "pattern"
# Watch mode
bun test --watch
```

### Build
```bash
# C shared library (used by IPC demo)
gcc -shared -o libshm.so -fPIC src/shm.c -lrt
```

### Lint / Format / Typecheck
- No ESLint/Prettier/Biome config found.
- No dedicated typecheck script. If needed and TypeScript is available:
  `bunx tsc -p tsconfig.json`

## Code Style and Conventions

### Imports and Modules
- Use ESM (`import` / `export`) only.
- Do not use CommonJS (`require`).
- Keep imports grouped by origin: built-ins, external, internal.
- Prefer explicit named imports over namespace imports.

### Bun-Native APIs (mandatory)
- HTTP server: `Bun.serve()` only. Do not introduce Express/Fastify/Hono.
- Filesystem: prefer `Bun.file()` over `node:fs`.
- FFI: use `bun:ffi` for C bindings (see `src/ipc/ffi.ts`).
- Shell commands: `Bun.$` instead of `child_process`.
- Environment variables: Bun loads `.env` automatically. Do not use dotenv.

### TypeScript Configuration
- Strict mode is enabled.
- Target is `ESNext`, module resolution is `bundler`.
- `noEmit` is true; Bun runs TS directly.
- Avoid `any` unless unavoidable. Do not suppress errors with `@ts-ignore`.

### Naming
- Classes: PascalCase (`IPCServer`, `SharedRingBuffer`).
- Functions/variables: camelCase.
- Constants: UPPER_SNAKE_CASE.
- Log prefixes: `[Bun]` for Bun-side, `[Python]` for Python-side logs, `[Audit]` for security events.

### Error Handling
- Use `try/catch` blocks.
- Log errors explicitly with context: `console.error("[Bun] Context error:", err)`.
- Avoid empty catch blocks unless explicitly suppressing (e.g., `unlink` cleanup).

### Formatting
- Keep lines readable (aim for ~100 chars where possible).
- Prefer early returns to deep nesting.
- Use `const` by default; `let` only when reassigned.

## Testing Guidelines

- Use `bun:test` only.
- Keep tests co-located with sources: `foo.ts` + `foo.test.ts`.
- Prefer deterministic tests; avoid network access unless explicitly required.
- Integration tests often require Docker (`bun run test:docker`) due to Linux-specific features.

## Python Integration (Linux-only)

- Shared memory via `multiprocessing.shared_memory`.
- Data plane: ring buffers using `[u32 len][payload]` framing.
- Control plane: Unix domain sockets.
- Python style: PEP8, snake_case, little-endian packing.
- Cleanup resources in `finally` blocks.

## Policy Model

- **Policies**: JSON files in `src/policies/` defining allowed/denied resources.
- **Enforcement**: Bun checks these policies before proxying network or allowing syscalls (via seccomp).
- **Missing Features**: Check `MISSING_FEATURES.md` before implementing new security features.

## Frontend Notes

- Use Bun HTML imports (`import indexHtml from "./public/index.html"`).
- HTML can import TSX/JSX/CSS directly.
- Keep UI logic in `src/public/` and favor minimal dependencies.

## Repository Layout

- `src/`: Source code.
  - `ipc/`: Shared memory and socket logic.
  - `sandbox/`: Linux namespace and policy enforcement.
  - `policies/`: JSON security policies.
  - `examples/`: Python scripts for testing policies.
- `libshm.so`: Compiled C library for shared memory (must be present).

## Git and Workflow

- Do not commit unless explicitly asked.
- Avoid broad refactors during bugfixes; keep changes minimal.
- Keep secrets out of the repo (`.env`, credentials, tokens).
- If tests are failing before your changes, report them explicitly.
- When adding new files, keep paths short and colocate with related code.

## Cursor/Copilot Rules

- No Cursor rules found (`.cursor/rules/` or `.cursorrules`).
- No Copilot instructions found (`.github/copilot-instructions.md`).
