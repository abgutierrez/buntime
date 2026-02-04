# Agent Instructions for buntime (python-ipc-bun)

Kernel-level sandbox with Bun supervisor and Python/Bun workers. High-performance
IPC via shared memory ring buffers. Policy-based security for filesystem, network,
and execution control.

## Architecture

- **Supervisor (Bun)**: Lifecycle, policy enforcement, network proxy, debug UI.
- **Worker (Python/Bun)**: Executes untrusted code in Linux namespaces.
- **Data plane**: Shared memory ring buffer via `bun:ffi`.
- **Control plane**: Unix domain sockets (READY/DATA/STOP signaling).

## Commands

### Install & Build
```bash
bun install
gcc -shared -o libshm.so -fPIC src/shm.c -lrt  # Required for shared memory
```

### Run
```bash
bun src/main.ts                                 # Local run
bun --hot ./src/main.ts                         # Watch mode
POLICY_FILE=src/policies/no-network.json bun src/main.ts
bun src/main.ts --debug-ui                      # With web interface
```

### Docker (Linux sandbox)
```bash
bun run app:docker                              # Docker Compose
bun run app:docker:watch                        # Watch mode
```

### Testing
```bash
bun test                                        # All tests
bun test src/tests/ipc/server.test.ts           # Single file
bun test -t "pattern"                           # Pattern match
bun run test:docker                             # Docker integration
```

### CLI
```bash
bunx python-ipc-bun run --allow-net=github.com main.ts
bunx python-ipc-bun init-policy --allow-read=/tmp > my-policy.json
```

## Code Style

### TypeScript

| Rule | Convention |
|------|------------|
| Indentation | 2 spaces |
| Semicolons | Always required |
| Quotes | Double quotes (`"`) |
| Imports | ESM only, grouped by origin (built-in → external → internal) |
| Types | Strict mode. No `any`, `@ts-ignore`, `@ts-expect-error` |
| Line length | No hard limit, prefer readability |

### Naming Conventions

| Type | Convention | Example |
|------|------------|---------|
| Classes/Types | PascalCase | `IPCServer`, `PolicyLoader` |
| Functions/Variables | camelCase | `startWorker`, `sharedMemory` |
| Constants | UPPER_SNAKE_CASE | `DEFAULT_TIMEOUT`, `MSG_TYPE_STDOUT` |
| Filenames | kebab-case | `ipc-server.ts`, `policy-loader.ts` |

### Import Order
```typescript
// 1. Built-in modules
import { join } from "path";
import { unlink } from "node:fs";

// 2. External dependencies
import Ajv from "ajv";
import nodeCidr from "node-cidr";

// 3. Internal modules
import { SharedRingBuffer } from "./ringbuffer";
import { type SandboxConfig } from "../config";
```

### Error Handling & Logging
- Use `try/catch` with specific error types
- Never use empty catch blocks
- Log with consistent prefixes:
  - `[Bun]` - Supervisor lifecycle
  - `[Python]` - Worker logs
  - `[Audit]` - Security events
  - `[CLI]` - Entrypoint logs

### Bun-Native APIs (Mandatory)
- **HTTP**: `Bun.serve()`, `Bun.listen()` (no Express/Hono)
- **File I/O**: `Bun.file()`, `Bun.write()`
- **Shell**: `Bun.$` or `Bun.spawn()`
- **FFI**: `bun:ffi` for C bindings
- **Tests**: `bun:test` (`describe`, `test`, `expect`, `mock`)

### Python Style
- PEP8 compliant
- snake_case for functions and variables
- Type hints via `typing` module
- Constants: UPPER_SNAKE_CASE
- Imports grouped: stdlib → third-party → local

## Repository Layout

```
src/
├── ipc/                    # Shared memory, sockets, ring buffers
│   ├── server.ts           # IPC server (Bun side)
│   ├── ringbuffer.ts       # Ring buffer implementation
│   ├── protocol.ts         # Message types
│   └── ffi.ts              # C bindings via bun:ffi
├── sandbox/
│   ├── launcher.ts         # Linux namespace spawner
│   └── policy/             # Policy loader, enforcer, schema
├── supervisor/             # Main supervisor logic
├── cli.ts                  # CLI entrypoint
├── config.ts               # Configuration types
├── proxy.ts                # Network proxy
├── worker.py               # Python worker implementation
├── worker-bun.ts           # Bun worker implementation
├── policies/               # JSON security policies
└── tests/                  # Test files (*.test.ts)
example/                    # Policy matrix, benchmarks
docs/                       # Architecture, policies, integration docs
```

## Testing Patterns

### Test File Structure
```typescript
import { describe, expect, test, mock } from "bun:test";

// Mock external dependencies before importing module under test
mock.module("../path/to/module", () => ({
  someFunction: () => mockValue,
}));

const { ModuleUnderTest } = await import("../path/to/module-under-test");

describe("ModuleUnderTest", () => {
  test("does something specific", () => {
    // Arrange, Act, Assert
    expect(result).toBe(expected);
  });
});
```

### Async Test Helpers
```typescript
function waitFor(predicate: () => boolean, timeoutMs = 1500): Promise<void> {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const tick = () => {
      if (predicate()) return resolve();
      if (Date.now() - start > timeoutMs) {
        return reject(new Error("Timed out"));
      }
      setTimeout(tick, 10);
    };
    tick();
  });
}
```

## IPC Protocol

### Message Framing
- Format: `[u32 len][payload]` (little-endian)
- Message types defined in `src/ipc/protocol.ts`:
  - `0x00` STDOUT, `0x01` FS_READ, `0x02` FS_WRITE
  - `0x03` NET_CONNECT, `0x04` EXEC, `0x05` LISTDIR
  - `0x10` ALLOW response, `0x11` DENY response

### Ring Buffer
- Two buffers per connection: `bun2py` and `py2bun`
- Header: head (u32), tail (u32), capacity (u32)
- Data region starts at offset 64

## Cursor/Copilot Rules

No Cursor rules (`.cursor/rules/`, `.cursorrules`) or Copilot instructions
(`.github/copilot-instructions.md`) configured.

## Key Constraints

1. **Type Safety**: Never suppress TypeScript errors
2. **Bun APIs**: Use native Bun APIs, not Node.js equivalents when available
3. **Security**: Policy enforcement is critical - never bypass checks
4. **Platform**: Full sandbox only works on Linux; macOS is policy-only mode
