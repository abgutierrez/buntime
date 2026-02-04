# Integration Guide

Buntime can be integrated into projects as a CLI tool or programmatically via the
Supervisor class. It supports Python and Bun workers with configurable security
policies via JSON, CLI flags, or environment variables.

## Overview

Buntime provides a kernel-level sandbox where Bun supervises untrusted workers. The system can be used in two primary ways:

- **CLI Tool**: Execute sandboxed scripts directly from the command line
- **Programmatic API**: Embed the Supervisor class in your own application

### Key Features

- Shared memory IPC for high-performance communication
- Policy-based security for filesystem, network, and execution control
- Support for Python and Bun worker types
- Configurable via JSON policies, CLI flags, or environment variables
- Docker deployment with runtime policy overrides

## Programmatic Usage

Import the Supervisor class and configure it with options to control worker behavior and policy enforcement.

### Basic Example

```typescript
import { Supervisor } from "./src/supervisor/supervisor";

const supervisor = new Supervisor({
  shmSize: 1024 * 1024,  // 1MB shared memory
  workerType: "python",   // or "bun"
  policyPath: "src/policies/default.json",
  sandboxEnabled: true,
});

supervisor.onEvent((event) => {
  if (event.type === "ready") {
    console.log("Worker ready");
  }
  if (event.type === "output") {
    console.log("Output:", event.data);
  }
  if (event.type === "error") {
    console.error("Error:", event.data);
  }
});

await supervisor.start();
supervisor.sendCode("print('hello')");
await supervisor.stop();
```

### SupervisorOptions Interface

```typescript
interface SupervisorOptions {
  policyPath?: string;           // Path to policy JSON file
  activePolicyPath?: string;      // Path for runtime active policy
  activePolicyMetaPath?: string;  // Path for policy metadata
  shmSize?: number;               // Shared memory size in bytes (default: 1MB)
  workerType?: "python" | "bun";  // Worker type (default: "python")
  sandboxEnabled?: boolean;       // Enable Linux namespace isolation (default: true)
}
```

### Event Types

The Supervisor emits events via `onEvent`:

| Event Type | Data | Description |
|------------|------|-------------|
| `ready` | - | Worker is ready to execute code |
| `output` | string | Worker stdout/stderr output |
| `error` | string | Error message |
| `state` | object | Worker state changes (e.g., exec_start, exec_end) |
| `policy-loaded` | NormalizedPolicy | Policy was loaded |
| `memory` | object | Memory usage statistics |
| `syscalls` | object | Syscall telemetry data |

## Configuration Options

The SandboxConfig interface controls runtime behavior including security mode, network policy, and resource limits.

### SandboxConfig Interface

```typescript
interface SandboxConfig {
  security: {
    mode: "strict" | "monitor";
  };
  network: {
    enabled: boolean;
    policy: "allow_list" | "deny_all";
    allow_list: string[];
    deny_list: string[];
    rate_limit: number;  // Connection rate limit per second
  };
  filesystem: {
    allow_write: boolean;  // Allow filesystem writes
  };
  resources: {
    memory_limit: number;  // Memory limit in MB
    cpu_limit: number;     // CPU limit percentage
  };
}
```

### Configuration Loading

Configuration is loaded from `config.json` in the working directory, or defaults are applied:

```typescript
import { loadConfig, type SandboxConfig } from "./src/config";

const config = await loadConfig("config.json");

// Apply config override when starting supervisor
await supervisor.start(configOverride);
```

### Default Configuration

If no config file is found, these defaults are used:

```javascript
{
  security: { mode: "strict" },
  network: {
    enabled: true,
    policy: "allow_list",
    allow_list: ["*"],
    deny_list: [],
    rate_limit: 5
  },
  filesystem: { allow_write: false },
  resources: {
    memory_limit: 64,  // MB
    cpu_limit: 50     // percentage
  }
}
```

## CLI Usage

The `python-ipc-bun` CLI provides a unified interface for running sandboxed
worker scripts with fine-grained permission control.

### Commands

#### run

Executes a script within a sandboxed pod.

```bash
bunx python-ipc-bun run [options] <entry> [args...]
```

#### init-policy

Generates a boilerplate policy file based on provided flags.

```bash
bunx python-ipc-bun init-policy --allow-net=github.com > my-policy.json
```

### Examples

Basic execution (strict defaults, deny all):

```bash
python-ipc-bun run main.ts
```

Allow specific network access:

```bash
bunx python-ipc-bun run --allow-net=github.com,jsr.io main.ts
```

Using a policy file with CLI overrides:

```bash
python-ipc-bun run --policy=src/policies/default.json --allow-write=/tmp main.py
```

### CLI Flags

| Flag | Description | Example |
|------|-------------|---------|
| `--allow-net[=hosts]` | Allow network access to hosts | `--allow-net=github.com,api.example.com` |
| `--deny-net[=hosts]` | Deny network access to hosts | `--deny-net=10.0.0.0/8` |
| `--allow-read[=paths]` | Allow reading from paths | `--allow-read=/tmp,/data` |
| `--deny-read[=paths]` | Deny reading from paths | `--deny-read=/etc/passwd` |
| `--allow-write[=paths]` | Allow writing to paths | `--allow-write=/tmp` |
| `--deny-write[=paths]` | Deny writing to paths | `--deny-write=/` |
| `--allow-env[=vars]` | Allow env var access | `--allow-env=PATH,HOME` |
| `--deny-env[=vars]` | Deny env var access | `--deny-env=AWS_*` |
| `--allow-run[=cmds]` | Allow subprocess execution | `--allow-run=/usr/bin/python3` |
| `--deny-run[=cmds]` | Deny subprocess execution | `--deny-run=/bin/sh` |
| `--allow-ffi[=paths]` | Allow dynamic library loading | `--allow-ffi=/usr/local/lib` |
| `--deny-ffi[=paths]` | Deny dynamic library loading | `--deny-ffi=/usr/lib` |
| `--allow-sys[=apis]` | Allow system info APIs | `--allow-sys=hostname,os` |
| `--deny-sys[=apis]` | Deny system info APIs | `--deny-sys=uid,gid` |
| `--allow-all` | Disable all restrictions | `--allow-all` |
| `--policy <file>` | Load policy from JSON | `--policy=strict.json` |
| `--shm-size <size>` | Shared memory size | `--shm-size=10mb` |
| `--worker <type>` | Worker type | `--worker=python` or `--worker=bun` |
| `--no-sandbox` | Disable Linux isolation | Dev mode only |
| `--debug-ui` | Enable web interface | Opens on :3000 |

### Flag Precedence

Permissions are evaluated in the following order (highest to lowest):

1. **CLI Flags**: Explicit `--allow-*` or `--deny-*` flags
2. **Policy File**: Settings defined in the file provided via `--policy`
3. **Defaults**: Hardcoded "secure-by-default" (deny all) settings

If a policy file allows `github.com` but the CLI flag is `--deny-net=github.com`,
access to `github.com` will be denied.

## Environment Variables

For Docker deployments and containerized environments, use POD_* prefixed
variables for policy configuration. These are scrubbed before spawning the
worker to prevent policy leakage.

### Environment Variable Mapping

| Variable | Maps To | Example |
|----------|---------|---------|
| `POD_ALLOW_NET` | `--allow-net` | `api.example.com` |
| `POD_DENY_NET` | `--deny-net` | `10.0.0.0/8` |
| `POD_ALLOW_READ` | `--allow-read` | `/data,/tmp` |
| `POD_DENY_READ` | `--deny-read` | `/etc` |
| `POD_ALLOW_WRITE` | `--allow-write` | `/output` |
| `POD_DENY_WRITE` | `--deny-write` | `/` |
| `POD_ALLOW_ENV` | `--allow-env` | `PATH,HOME` |
| `POD_DENY_ENV` | `--deny-env` | `AWS_*` |
| `POD_ALLOW_RUN` | `--allow-run` | `/usr/bin/python3` |
| `POD_DENY_RUN` | `--deny-run` | `/bin/sh` |
| `POD_ALLOW_FFI` | `--allow-ffi` | `/usr/local/lib` |
| `POD_DENY_FFI` | `--deny-ffi` | `/usr/lib` |
| `POD_ALLOW_SYS` | `--allow-sys` | `hostname,os` |
| `POD_DENY_SYS` | `--deny-sys` | `uid,gid` |
| `POD_POLICY_JSON` | Base64 encoded policy | `eyJ2ZXJzaW9uIjox...` |

### Worker Environment Scrubbing

The Supervisor scrubs all `POD_*` variables before spawning the worker process.
Only non-sensitive variables (like `PYTHONUNBUFFERED`) are passed through.

```typescript
// Example: Worker receives only:
env: { POLICY_PATH: "/path/to/policy.json", PYTHONUNBUFFERED: "1" }
```

## Docker Deployment

The recommended approach is a multi-stage Dockerfile separating the build environment from the lean runtime environment.

### Dockerfile Example

```dockerfile
# Stage 1: Build
FROM oven/bun:1.3.6 AS builder
WORKDIR /app
COPY . .
RUN bun install
RUN gcc -shared -o libshm.so -fPIC src/shm.c -lrt

# Stage 2: Runtime
FROM oven/bun:1.3.6-slim
WORKDIR /app

# Install Python and networking tools
RUN apt-get update && apt-get install -y \
    python3 \
    iproute2 \
    procps \
    && rm -rf /var/lib/apt/lists/*

# Copy artifacts from builder
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/libshm.so ./libshm.so
COPY . .

# Environment setup
ENV NODE_ENV=production

# Entrypoint setup (policy via flags or env)
ENTRYPOINT ["bunx", "python-ipc-bun", "run"]
CMD ["main.ts"]
```

### Runtime Configuration

Override policy at runtime using environment variables or CLI flags:

```bash
# With environment variables
docker run --rm --privileged \
  -e POD_ALLOW_NET=api.example.com \
  -e POD_DENY_NET=10.0.0.0/8 \
  -p 3000:3000 \
  buntime my-script.py

# With CLI overrides
docker run --rm --privileged \
  -p 3000:3000 \
  buntime --allow-write=/tmp my-script.py
```

### Docker Compose Example

```yaml
services:
  buntime:
    build: .
    privileged: true
    ports:
      - "3000:3000"
    environment:
      - POD_ALLOW_NET=api.example.com
      - POD_ALLOW_WRITE=/tmp
      - POD_DENY_NET=10.0.0.0/8
```

### Network Configuration

When running in Docker, the `--privileged` flag is required to allow the
Supervisor to create veth pairs and manipulate network namespaces inside the
container.

- **Supervisor IP**: `169.254.1.1` (on `veth-bun`)
- **Worker IP**: `169.254.1.2` (on `veth-sb`)
- **Proxy Port**: `8080` (accessible from Worker via Supervisor IP)

## Worker Types

Buntime supports two worker implementations with different IPC mechanisms and policy enforcement approaches.

### Python Worker (default)

Uses `src/worker.py` with shared memory via `multiprocessing.shared_memory`.

Features:
- Shared memory via `multiprocessing.shared_memory`
- Policy hooks via monkey-patching builtins
- Linux namespace isolation support
- Suitable for Python code execution

Worker command:

```bash
python3 src/worker.py <socket_path> <shm_name> <shm_size>
```

### Bun Worker

Uses `src/worker-bun.ts` with native shared memory via `bun:ffi`.

Features:
- Native shared memory via `bun:ffi`
- Policy hooks via Bun APIs
- Lower IPC overhead
- Suitable for TypeScript/JavaScript code execution

Worker command:

```bash
bun src/worker-bun.ts <socket_path> <shm_name> <shm_size>
```

### Selecting Worker Type

```typescript
// CLI
bunx python-ipc-bun run --worker=bun main.ts
bunx python-ipc-bun run --worker=python main.py

// Programmatic
const supervisor = new Supervisor({
  workerType: "bun"  // or "python"
});
```

## IPC Protocol for Custom Workers

If implementing a custom worker, follow the IPC protocol for communication with the Supervisor.

### Worker Arguments

The worker receives three command-line arguments:

```bash
<socket_path> <shm_name> <shm_size>
```

- `socket_path`: Path to Unix domain socket for control plane
- `shm_name`: Name of shared memory segment
- `shm_size`: Total size of shared memory (split 50/50 for bidirectional rings)

### Shared Memory Layout

Open the shared memory with the provided name. The size is split evenly:

- First half: Worker to Supervisor ring buffer
- Second half: Supervisor to Worker ring buffer

Each ring buffer uses u32 length prefixed framing:

```
[u32 length][payload bytes]
```

### Socket Protocol

1. Connect to the Unix socket at `socket_path`
2. Send `READY\n` when worker initialization is complete
3. Send policy check requests for operations requiring approval

### Message Format

All messages use this format:

```
[u8 type][u32 req_id][payload bytes]
```

Message types:
- `FS_READ` (1): Request filesystem read permission
- `FS_WRITE` (2): Request filesystem write permission
- `NET_CONNECT` (3): Request network connection permission
- `EXEC` (4): Request subprocess execution permission
- `LISTDIR` (5): Request directory listing permission

### Policy Check Flow

```python
# Example: Request file read permission
req_id = 1
path = "/tmp/data.txt".encode()
message = bytes([MsgType.FS_READ]) + req_id.to_bytes(4, 'little') + path
socket.send(message)

# Wait for response
response = socket.recv(5)  # [u8 allowed][u32 req_id]
allowed = response[0] == 1
```

## Lambda-Like Integration Example

Integrate Buntime as a lambda-like function executor for serverless-style code execution.

```typescript
import { Supervisor } from "./src/supervisor/supervisor";
import { loadPolicy } from "./src/sandbox/policy/loader";

interface ExecutionResult {
  output: string;
  error?: string;
  exitCode?: number;
}

async function executeUntrustedCode(
  code: string,
  policyPath: string = "src/policies/lambda.json"
): Promise<ExecutionResult> {
  const supervisor = new Supervisor({
    shmSize: 1024 * 1024,  // 1MB
    workerType: "python",
    policyPath,
    sandboxEnabled: true,
  });

  let output = "";
  let error: string | undefined;
  let exitCode: number | undefined;

  supervisor.onEvent((event) => {
    if (event.type === "output") {
      output += event.data ?? "";
    }
    if (event.type === "error") {
      error = event.data;
    }
    if (event.type === "state" && event.data?.worker === "exec_end") {
      exitCode = event.data.exitCode ?? event.data.exit_code;
    }
  });

  await supervisor.start();
  supervisor.sendCode(code);

  // Wait for execution completion
  await new Promise<void>((resolve) => {
    const unsubscribe = supervisor.onEvent((event) => {
      if (
        event.type === "state" &&
        ["exec_end", "exception", "interrupted"].includes(event.data?.worker)
      ) {
        unsubscribe();
        resolve();
      }
    });
  });

  supervisor.stop();

  return { output, error, exitCode };
}

// Usage
const result = await executeUntrustedCode(`
import json
result = {"message": "hello world"}
print(json.dumps(result))
`);
console.log(result.output);
```

### Example Lambda Policy (src/policies/lambda.json)

```json
{
  "version": 1,
  "plugins": {
    "namespaces": true,
    "landlock": true,
    "seccomp": true
  },
  "defaults": {
    "fs": "deny",
    "net": "deny",
    "exec": "deny"
  },
  "rules": {
    "fs": {
      "allow": ["/tmp", "/proc/self/fd"],
      "mode": "read"
    },
    "net": {
      "allow": [],
      "mode": "allow"
    },
    "exec": {
      "allow": []
    }
  },
  "audit": {
    "enabled": true,
    "events": ["openat", "connect", "execve"]
  }
}
```

## Platform Support

| Platform | Sandbox | IPC | Network | Notes |
|----------|---------|-----|---------|-------|
| Linux (native) | Full | Yes | Yes | Requires root |
| Linux (Docker) | Full | Yes | Yes | Requires `--privileged` |
| macOS | None | Yes | Yes | Policy enforcement only |

## Additional Resources

- [Architecture Documentation](ARCHITECTURE.md) - System design and components
- [Policies Guide](POLICIES.md) - Policy schema and best practices
- [Debug UI Guide](DEBUG-UI.md) - Web interface for testing and telemetry
- [Development Guide](DEVELOPMENT.md) - Contributing guidelines
