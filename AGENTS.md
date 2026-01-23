# Agent Instructions for python-ipc-bun

This repo implements a kernel-level sandbox and IPC system where Bun is the
supervisor and Python is the untrusted worker. Follow these rules unless a task
explicitly says otherwise.

## Architecture Overview

- Supervisor (Bun): lifecycle, policy enforcement, network proxy.
- Worker (Python): executes untrusted code in Linux namespaces or raw process.
- Data plane: shared memory ring buffer via `bun:ffi`.
- Control plane: Unix domain sockets for READY/DATA/STOP signaling.

## Commands

### Install
```bash
bun install
```

### Build (local shared memory library)
```bash
gcc -shared -o libshm.so -fPIC src/shm.c -lrt
```

### Run (local)
```bash
bun src/main.ts
bun --hot ./src/main.ts
```

### Run with policy (local)
```bash
POLICY_FILE=src/policies/no-network.json bun src/main.ts
```

### Docker (Linux-only IPC)
```bash
docker build -t bun-ipc-demo .
docker run --rm --privileged -p 3000:3000 bun-ipc-demo
```

### Docker Compose (preferred for Linux sandbox)
```bash
bun run app:docker
bun run app:docker:watch
```

### CLI (pod/runner)
```bash
bunx python-ipc-bun run --allow-net=github.com main.ts
bunx python-ipc-bun init-policy --allow-read=/tmp > my-policy.json
```

### Scripts (package.json)
```bash
bun run test:docker
bun run test:docker:watch
bun run test:comprehensive
bun run test:comprehensive:nopolicy
bun run test:comprehensive:default
bun run test:comprehensive:fs
bun run test:comprehensive:net
bun run test:comprehensive:exec
bun run test:combinations
bun run examples:matrix
bun run examples:matrix:comprehensive
bun run bench:compare
bun run bench:report
```

## Tests

```bash
# All tests
bun test

# Single test file
bun test src/tests/ipc/server.test.ts

# Tests matching a pattern
bun test -t "pattern"

# Watch mode
bun test --watch
```

### Docker Integration Tests (Linux-only features)
```bash
bun run test:docker
bun run test:docker:watch
```

### Optional UI E2E (if Playwright tests exist; see TESTING_PLAN.md)
```bash
bunx playwright test src/e2e/
```

## Lint / Format / Typecheck

- No ESLint/Prettier/Biome config found.
- No dedicated typecheck script. If needed:
  `bunx tsc -p tsconfig.json`

## Code Style and Conventions

### Imports and Modules
- Use ESM only (`import` / `export`). No CommonJS (`require`).
- Group imports by origin: built-ins, external, internal.
- Prefer named imports over namespace imports.
- Use `import type` for type-only imports.

### TypeScript Configuration (tsconfig.json)
- `strict: true`, `noEmit: true`, `moduleResolution: "bundler"`.
- `allowImportingTsExtensions: true`, `resolveJsonModule: true`.
- `noUncheckedIndexedAccess: true`, `noImplicitOverride: true`.
- Avoid `any` and do not suppress errors with `@ts-ignore` or `@ts-expect-error`.

### Naming
- Classes and types: PascalCase (`IPCServer`, `PolicyLoader`).
- Functions and variables: camelCase.
- Constants: UPPER_SNAKE_CASE.

### Error Handling and Logging
- Use `try/catch` with explicit context in messages.
- Avoid empty `catch` blocks unless explicitly suppressing cleanup failures.
- Log prefixes should be consistent:
  - `[Bun]` supervisor lifecycle
  - `[Python]` worker-side logs
  - `[Audit]` security events
  - `[Proxy]` network proxy
  - `[CLI]` or `[Main]` entrypoints

### Formatting
- 2-space indentation is common in source files.
- Keep lines readable (aim for ~100 chars where possible).
- Prefer early returns to deep nesting.
- Use `const` by default; `let` only when reassigned.

## Bun-Native APIs (mandatory)

- HTTP server: `Bun.serve()` only (no Express/Fastify/Hono).
- Filesystem: prefer `Bun.file()` / `Bun.write()` over `node:fs`.
- FFI: use `bun:ffi` for C bindings.
- Shell: use `Bun.$` for commands.
- Environment: Bun loads `.env` automatically; do not use dotenv.
- Bundling: prefer `bun build <file.ts|file.html|file.css>` for assets.

## Testing Guidelines

- Use `bun:test` only.
- Tests live in `src/tests/**` with `.test.ts` suffix.
- Prefer deterministic tests; avoid network unless required by the test.
- Linux-only integration tests typically require Docker (`bun run test:docker`).

## Python Integration (Linux-only)

- Shared memory via `multiprocessing.shared_memory`.
- Data plane framing: `[u32 len][payload]`.
- Control plane: Unix domain sockets.
- Python style: PEP8, snake_case, little-endian packing.
- Cleanup resources in `finally` blocks.

## Policy Model

- Policies: JSON files in `src/policies/` defining allow/deny/warn rules.
- Enforcement: Bun checks policies before proxying network or allowing syscalls.
- Check `MISSING_FEATURES.md` before implementing new security features.

## Frontend Notes

- Use Bun HTML imports (`import indexHtml from "./public/index.html"`).
- HTML can import TSX/JSX/CSS directly via Bun bundler.
- Keep UI logic in `src/public/` and favor minimal dependencies.

## Repository Layout

- `src/`: main source code
  - `ipc/`: shared memory and socket logic
  - `sandbox/`: Linux namespace and policy enforcement
  - `policies/`: JSON security policies
  - `tests/`: Bun test files
- `example/`: policy matrix and benchmark scripts
- `docs/specs/cli.md`: CLI usage and flag precedence
- `TESTING_PLAN.md`: integration and UI testing guidance
- `libshm.so`: compiled shared memory library (required at runtime)

## Cursor/Copilot Rules

- No Cursor rules found (`.cursor/rules/` or `.cursorrules`).
- No Copilot instructions found (`.github/copilot-instructions.md`).
