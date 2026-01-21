# Agent Instructions for python-ipc-bun

This repository uses **Bun** as the runtime, package manager, and bundler. Follow these guidelines for all development tasks.

## 1. Environment & Commands

- **Runtime**: Use `bun` exclusively. Do not use `node`, `npm`, `yarn`, or `pnpm`.
- **Install Dependencies**:
  ```bash
  bun install
  ```
- **Run Application**:
  ```bash
  bun run index.ts
  # For development with hot reloading:
  bun --hot ./index.ts
  # Run with specific policy:
  POLICY_FILE=src/policies/no-network.json bun run src/main.ts
  ```
- **Run in Docker** (Linux-only IPC):
  ```bash
  docker build -t bun-ipc-demo .
  docker run -it --rm --privileged -p 3000:3000 bun-ipc-demo
  # With tmux for persistent sessions:
  tmux new -s bun-ipc
  docker run -it --rm --privileged -p 3000:3000 bun-ipc-demo
  ```
- **Run Tests**:
  ```bash
  bun test
  # Run a single test file:
  bun test path/to/file.test.ts
  # Run tests matching a pattern:
  bun test -t "pattern"
  ```
- **Build**:
  ```bash
  # Build C library (run in Docker container):
  gcc -shared -o libshm.so -fPIC src/shm.c -lrt
  ```

## 2. Code Style & Conventions

### Imports & Modules
- Use **ES Modules** (`import` / `export`) exclusively.
- **Do not** use CommonJS (`require`).
- Use `verbatimModuleSyntax` (imports are preserved as-is).
- **Filesystem**: Prefer `Bun.file()` over `node:fs`.
  ```ts
  // Good
  const text = await Bun.file("path/to/file.txt").text();

  // Avoid
  import fs from "node:fs/promises";
  const text = await fs.readFile("path/to/file.txt", "utf-8");
  ```

### Bun-Native APIs (Mandatory)
- **HTTP Server**: Use `Bun.serve()`. **Do NOT use Express, Fastify, or Hono** unless explicitly requested.
  ```ts
  Bun.serve({
    fetch(req) {
      return new Response("Hello World");
    }
  });
  ```
- **FFI (Foreign Function Interface)**: Use `bun:ffi` for C library bindings.
  ```ts
  import { dlopen, FFIType, ptr, type Pointer } from "bun:ffi";

  const lib = dlopen("libshm.so", {
    myFunction: {
      args: [FFIType.i32, FFIType.ptr],
      returns: FFIType.i32,
    },
  });
  // Use toArrayBuffer for pointer casting
  import { toArrayBuffer } from "bun:ffi";
  const buffer = toArrayBuffer(ptrAddr as unknown as Pointer, 0, size);
  ```
- **SQLite**: Use `bun:sqlite`. **Do NOT use `better-sqlite3` or `sqlite3`**.
- **Postgres**: Use `Bun.sql`. **Do NOT use `pg` or `postgres.js`**.
- **Redis**: Use `Bun.redis`. **Do NOT use `ioredis`**.
- **Shell Commands**: Use `Bun.$` instead of `child_process` or `execa`.
  ```ts
  import { $ } from "bun";
  await $`ls -l`;
  ```
- **Environment Variables**: Bun loads `.env` automatically. **Do NOT use `dotenv`**.

### TypeScript Config
- **Strict Mode**: Enabled. No `any` unless absolutely necessary.
- **Target**: `ESNext`.
- **Module Resolution**: `bundler`.
- **No Emit**: `tsc` is for type checking only; Bun handles execution.

### Error Handling
- Use standard `try/catch` blocks.
- Return standard `Response` objects for HTTP errors in `Bun.serve`.
- **IPC-specific**: Use prefixed log messages for debugging cross-process issues:
  ```ts
  console.log("[Bun] Starting IPC Server...");
  console.error("[Bun] FFI Load Error:", e);
  // In Python:
  print(f"[Python] Connecting to {socket_path}...")
  ```

### Naming Conventions
- **Classes**: PascalCase (`IPCServer`, `SharedRingBuffer`)
- **Methods/Variables**: camelCase
- **Constants**: UPPER_SNAKE_CASE
- **Log Prefixes**: Always use `[Bun]` for Bun-side and `[Python]` for Python-side logs

## 3. Testing Guidelines
- Use the built-in `bun:test` module. **Do NOT use Jest, Vitest, or Mocha**.
  ```ts
  import { test, expect, describe } from "bun:test";

  describe("Math", () => {
    test("addition", () => {
      expect(1 + 1).toBe(2);
    });
  });
  ```
- Use `bun test --watch` for TDD workflows.

## 4. Python Integration (Linux-only)
- **Shared Memory**: Python uses `multiprocessing.shared_memory` to access the same SHM regions as Bun.
- **Communication**:
  - **Data Plane**: Ring buffers in shared memory (length-framed messages: `[u32 len][payload]`)
  - **Control Plane**: Unix Domain Sockets for signaling (`READY`, `DATA`, `STOP`)
- **Code Execution**: Python worker accepts code strings via IPC, executes with `eval`/`exec`, and captures output.
- **Python Style**:
  - PEP 8 compliance (snake_case for functions/variables)
  - Class names matching TS for symmetry (`SharedRingBuffer`)
  - Struct packing for binary data: `struct.pack("<I", value)` (little-endian)
  - Use `bytes()` conversion for `memoryview` before decode
  - Custom file-like objects for stdout redirection
- **Process Management**:
  - Python spawned via `Bun.spawn()`
  - Send `SIGINT` for interrupt: `processHandle.kill("SIGINT")`
  - Cleanup: always `shm.close()` and `sock.close()` in `finally` blocks

## 5. Policy Enforcement & Execution Roles

This project follows a supervisor-worker architecture for secure code execution.

### Runtime Roles & Responsibilities
- **Bun (Supervisor/Auditor)**: 
  - Manages the lifecycle of Python worker processes.
  - Acts as the primary auditor, enforcing security policies before and during execution.
  - Controls system-level access, including a **deny-by-default** network policy.
- **Python (Executor)**:
  - Responsible for executing disk-loaded scripts and code snippets received via IPC.
  - Operates within the resource and security constraints established by the Bun supervisor.

### Policy Enforcement Approach
- **Policy Templates**: Security constraints are defined using JSON templates (found in `src/policies/`).
- **Enforcement Layer**: 
  - Bun enforces high-level policies (network, file access, process environment).
  - Python-side enforcement (e.g., restricted built-ins, restricted `import`) is planned as **future work**. Current security relies on the supervisor's constraints.
- **Network Policy**: Deny-by-default. All network access must be explicitly permitted in the execution policy.

## 6. Frontend Development
- This project supports direct frontend bundling via Bun.
- Use HTML imports with `Bun.serve()`.
- **Do NOT use Vite, Webpack, or Create React App**.
- Import CSS and TSX/JSX files directly into HTML or other TSX files.
  ```ts
  // Server-side
  import index from "./index.html";
  Bun.serve({ routes: { "/": index } });
  ```
  ```html
  <!-- index.html -->
  <script type="module" src="./frontend.tsx"></script>
  ```

## 7. Directory Structure
- Keep the root clean.
- Place source code in `src/` if the project grows (currently flat structure).
- Tests should be co-located with source files (e.g., `user.ts` and `user.test.ts`).

## 8. Git & Commit Guidelines
- **Commit Messages**: Use imperative mood (e.g., "Add feature", "Fix bug").
- **Files to Ignore**: Ensure `node_modules`, `.env`, and build artifacts are in `.gitignore`.

---
*Generated by Sisyphus Agent based on CLAUDE.md and project configuration.*
