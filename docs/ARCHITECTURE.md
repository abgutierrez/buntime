# Buntime Architecture

## Overview

Buntime implements a Supervisor-Worker security model where Bun acts as trusted
Supervisor and Python (or Bun) runs as an untrusted Worker. The system
provides kernel-level isolation on Linux and policy-based security enforcement
across all platforms.

### Design Goals

- **Isolation**: Linux namespace-based sandboxing for untrusted code execution
- **Performance**: Zero-copy shared memory IPC for low-latency communication
- **Security**: Granular policy enforcement for filesystem, network, and
  execution operations
- **Observability**: Real-time telemetry and audit logging via shared memory
- **Cross-Platform**: Full feature set on Linux, reduced capabilities on
  macOS (policy enforcement only)

## System Components

### Supervisor (Bun)

The Supervisor is the trusted orchestrator that manages worker lifecycle and
enforces security policies.

#### Lifecycle Manager (`src/supervisor/supervisor.ts`)

The `Supervisor` class orchestrates the entire system:

- **Worker Spawning**: Creates worker processes with appropriate isolation
- **Policy Loading**: Loads and validates security policies from JSON files
- **State Management**: Tracks worker state transitions
  (Ready, Running, Stopped)
- **Event Emission**: Provides real-time status updates to listeners
- **Resource Management**: Handles shared memory lifecycle and cleanup

```typescript
const supervisor = new Supervisor({
  workerType: "python",  // or "bun"
  shmSize: 1024 * 1024, // 1MB shared memory
  sandboxEnabled: true
});
await supervisor.start();
supervisor.sendCode('print("Hello, world!")');
supervisor.stop();
```

#### Policy Engine (`src/sandbox/policy/`)

The policy system consists of three main components:

- **PolicyLoader** (`src/sandbox/policy/loader.ts`): Loads and validates
  JSON policies against schema
- **PolicyEnforcer** (`src/sandbox/policy/enforcer.ts`): Evaluates
  policy rules for each operation
- **Policy Set Management** (`src/sandbox/policy/set.ts`): Merges multiple
  policies and manages metadata

Policy structure (from `src/sandbox/policy/schema.json`):

```json
{
  "version": 1,
  "plugins": {
    "namespaces": true,
    "landlock": false,
    "seccomp": false
  },
  "defaults": {
    "fs": "deny",
    "net": "deny",
    "exec": "deny"
  },
  "fs": {
    "rules": [
      {
        "action": "allow",
        "path": "/tmp",
        "perms": ["read_file", "write_file", "read_dir"]
      }
    ]
  },
  "net": {
    "rules": [
      {
        "action": "allow",
        "proto": "tcp",
        "cidr": "0.0.0.0/0",
        "ports": "443"
      }
    ]
  },
  "exec": {
    "rules": [
      {
        "action": "allow",
        "path": "/usr/bin/python3"
      }
    ]
  }
}
```

#### Network Proxy (`src/proxy.ts`)

The `NetworkProxy` class provides transparent HTTP/HTTPS proxying for worker
processes:

- **HTTP/CONNECT Support**: Handles both plain HTTP and HTTPS CONNECT tunnels
- **Host-Based Filtering**: Enforces allow/deny lists on hostname
- **Header Parsing**: Extracts Host headers for routing decisions
- **Bidirectional Tunneling**: Forwards data between worker and upstream
  servers

The proxy runs on port 8080 (configurable) and is only started when
network restrictions are in place.

#### IPC Server (`src/ipc/server.ts`)

The `IPCServer` class manages all communication with workers:

- **Shared Memory Setup**: Creates and maps POSIX shared memory segments
- **Unix Socket Server**: Handles control plane signaling
- **Policy Check Callback**: Evaluates worker permission requests
- **Network Configuration**: Sets up veth pairs for Linux sandbox
  networking

#### Debug UI (`example/debug-ui/`)

The web interface provides real-time monitoring and testing:

- **Policy Editor**: Visual policy creation and modification
- **Code Execution**: Interactive code execution with live output
- **Memory Inspector**: Ring buffer usage visualization
- **Audit Log**: Real-time security event streaming

Accessed via `--debug-ui` flag at <http://localhost:3000>.

### Worker (Python/Bun)

The Worker executes untrusted code in a restricted environment.

#### IPC Client (`src/worker.py`, `src/worker-bun.ts`)

Worker processes communicate with the Supervisor via:

- **Shared Memory Ring Buffers**: Zero-copy data transfer
- **Policy Hooks**: Intercepted calls for permission checking
- **Unix Domain Sockets**: Control plane signaling

Python worker hooks:

- `builtins.open` → File read/write operations
- `os.listdir` → Directory listing
- `subprocess.run` → Process execution
- `socket.create_connection` → Network connections

#### Policy Hooks

When worker code attempts restricted operations, policy hooks send IPC messages to
the Supervisor:

1. **Synchronous Check**: For write operations, execution, and network connects

   - Worker sends request and waits for ALLOW/DENY response
   - Blocks until Supervisor responds

2. **Optimistic Check**: For read operations and directory listing

   - Worker sends notification but continues immediately
   - Supervisor logs operation and can kill worker if denied

#### User Code

The actual untrusted code runs in an isolated environment:

- **Python**: Evaluated via `eval()` or `exec()` in a controlled global
  context
- **Bun**: Executed similarly with TypeScript/JavaScript support
- **Output Capture**: All stdout is intercepted and forwarded via IPC
- **Exception Handling**: Errors are caught and forwarded with full stack traces

## Communication Architecture

Buntime uses a dual-plane communication model for optimal performance and
control.

### Data Plane (Shared Memory)

#### Ring Buffer Implementation (`src/ipc/ringbuffer.ts`)

The `SharedRingBuffer` class implements a circular buffer with:

- **Header Region**: 64 bytes for metadata (head, tail, capacity)
- **Data Region**: Remaining space for message payloads
- **Lock-Free Design**: Single-reader, single-writer semantics
- **Wrap-Around Handling**: Handles buffer boundary crossing correctly

Memory layout:

```text
+------------------+
|  Header (64B)    |  head: read pointer
|  - head (4B)     |  tail: write pointer
|  - tail (4B)     |  capacity: max bytes
|  - capacity (4B)  |
+------------------+
|  Data (N-64B)    |  Ring buffer for messages
|  [msg1][msg2]... |
+------------------+
```

#### Dual Ring Buffers

Shared memory is split into two independent ring buffers:

- **bun2py**: Supervisor → Worker (default size: ~512KB)

  - Used for sending code payloads and policy responses
  - Managed by `IPCServer.bun2py`

- **py2bun**: Worker → Supervisor (default size: ~512KB)

  - Used for sending output and policy requests
  - Managed by `IPCServer.py2bun`

Total shared memory size defaults to 1MB (configurable via `shmSize`
parameter).

#### Message Framing

Each message in ring buffer follows this format:

```text
+------------------+
|  Length (4B)     |  Little-endian u32, payload byte count
+------------------+
|  Payload (N)      |  Actual message data
+------------------+
```

Framing code (TypeScript):

```typescript
// Write
const lenBytes = new DataView(new ArrayBuffer(4));
lenBytes.setUint32(0, payload.length, true);
this.writeRaw(lenBytes);
this.writeRaw(payload);

// Read
const msgLen = new DataView(buffer).getUint32(0, true);
const payload = this.readRaw(msgLen);
```

### Control Plane (Unix Sockets)

#### Unix Domain Socket

The Supervisor creates a random Unix domain socket path:

```typescript
const socketName = `bun-${Math.random().toString(36).slice(2)}.sock`;
const socketPath = join(process.cwd(), socketName);
```

Path length is checked and fallback to `/tmp` if too long (>100 chars).

#### Signaling Protocol

Messages sent over the control socket are newline-terminated plain text:

| Signal    | Description                                    | Direction      |
|-----------|-----------------------------------------------|----------------|
| `READY`   | Worker has initialized and is ready for code      | Worker → Sup   |
| `DATA`     | Data available in shared memory                | Worker → Sup   |
| `CHECK`    | Policy check request pending                    | Worker → Sup   |
| JSON state | Worker state changes (exec_start, exception, etc.) | Worker → Sup   |

State events use JSON format:

```json
{"type": "state", "event": "exec_start"}
{"type": "state", "event": "exception", "data": {"error": "ValueError: ..."}}
```

#### Socket Lifecycle

1. **Supervisor creates socket** and starts listening
2. **Worker receives socket path** as first command-line argument
3. **Worker connects** with retry loop (30 attempts, 100ms interval)
4. **Worker sends `READY`** to signal readiness
5. **Worker sends `DATA`/`CHECK`** when messages are available
6. **Supervisor reads ring buffer** and processes messages
7. **Socket closes** when worker exits or Supervisor stops

## Message Types

### Message Types (`src/ipc/protocol.ts`)

The `MsgType` enum defines all message types exchanged between Supervisor
and Worker.

| Type        | Value | Description                    | Direction      |
|-------------|--------|-------------------------------|----------------|
| `STDOUT`    | 0x00   | Worker output to display          | Worker → Sup   |
| `FS_READ`   | 0x01   | File read permission check      | Worker → Sup   |
| `FS_WRITE`  | 0x02   | File write permission check     | Worker → Sup   |
| `NET_CONNECT`| 0x03   | Network connection permission   | Worker → Sup   |
| `EXEC`      | 0x04   | Process execution permission   | Worker → Sup   |
| `LISTDIR`   | 0x05   | Directory listing notification | Worker → Sup   |
| `CODE`      | 0x20   | Code execution payload         | Sup → Worker |

All messages include a 4-byte request ID for matching requests to responses
(except `STDOUT` and `CODE`).

### Response Types

The `ResponseType` enum defines permission responses.

| Type   | Value | Description                  | Direction      |
|--------|--------|-----------------------------|----------------|
| `ALLOW` | 0x10   | Permission granted, proceed   | Sup → Worker |
| `DENY`  | 0x11   | Permission denied, abort     | Sup → Worker |

Responses are sent via ring buffer and trigger a `DATA` notification on the
control socket.

### Message Format

All messages share a common 5-byte header followed by optional payload:

```text
+------------------+
|  Type (1B)        |  MsgType or ResponseType enum value
+------------------+
|  ReqID (4B)       |  Request identifier (little-endian u32)
+------------------+
|  Payload (N)       |  Type-specific data (optional)
+------------------+
```

Example messages:

```typescript
// Send code payload
const code = new TextEncoder().encode('print("Hello")');
const buf = new Uint8Array(5 + code.length);
buf[0] = MsgType.CODE;  // Type
new DataView(buf.buffer).setUint32(1, 0, true);  // ReqID = 0
buf.set(code, 5);  // Payload

// File write request
const path = new TextEncoder().encode('/tmp/file.txt');
const buf = new Uint8Array(5 + path.length);
buf[0] = MsgType.FS_WRITE;
new DataView(buf.buffer).setUint32(1, 42, true);  // ReqID = 42
buf.set(path, 5);

// Deny response
const buf = new Uint8Array(5);
buf[0] = ResponseType.DENY;
new DataView(buf.buffer).setUint32(1, 42, true);  // Match request ID
```

## Policy Enforcement Flow

Policy enforcement happens in real-time as worker code attempts restricted
operations.

### Request-Response Cycle

1. **Worker attempts operation** (e.g., `open('/tmp/file.txt', 'w')`)
2. **Hook intercepts call** and extracts relevant parameters
3. **Worker sends policy check** via IPC (type + payload)
4. **Worker sends `CHECK` signal** on control socket
5. **Supervisor receives signal** and reads from `py2bun` ring buffer
6. **PolicyEnforcer evaluates** rules against the request
7. **Supervisor sends response** via `bun2py` ring buffer
8. **Worker reads response** and proceeds or raises `PermissionError`

### Synchronous vs Optimistic

Different operation types use different enforcement strategies:

#### Synchronous (Blocking)

Used for dangerous operations that must be prevented:

- **File Write** (`FS_WRITE`): Worker blocks until ALLOW response
- **Process Exec** (`EXEC`): Worker blocks until ALLOW response
- **Network Connect** (`NET_CONNECT`): Worker blocks until ALLOW response

Flow:

```python
def guarded_write(path):
    # Send request
    policy_client.send_sync(MSG_TYPE_FS_WRITE, path.encode())
    # Block for response
    if not allowed:
        raise PermissionError(f"policy denied write: {path}")
    return original_open(path, 'w')
```

#### Optimistic (Non-blocking)

Used for read operations where Supervisor can retroactively deny:

- **File Read** (`FS_READ`): Worker proceeds immediately, Supervisor logs
- **Directory List** (`LISTDIR`): Worker proceeds immediately, Supervisor logs

If denied by policy, Supervisor kills the worker:

```typescript
// In IPCServer.handleData()
if (type === MsgType.FS_READ && !result.allowed) {
    console.error("[Bun] Optimistic Violation! Killing worker.");
    this.stop();  // SIGKILL
    return;
}
```

### Policy Resolution Logic (`src/sandbox/policy/enforcer.ts`)

The `PolicyEnforcer` resolves actions using this priority:

1. **Deny** takes highest priority (safety first)
2. **Warn** logs the operation but allows it
3. **Allow** permits the operation
4. **Default** action if no rules match

```typescript
private resolveAction(actions: Action[], fallback: Action): Action {
    if (actions.includes("deny")) return "deny";
    if (actions.includes("warn")) return "warn";
    if (actions.includes("allow")) return "allow";
    return fallback;
}
```

Multiple rules can match a request (e.g., path `/tmp/foo.txt` matches both
`/tmp` and `/tmp/foo`). The first matching rule in the list determines
the action.

## Linux Sandbox Architecture

Linux-only features provide strong isolation through kernel namespaces.

### Namespace Setup (`src/sandbox/launcher.ts`)

The `SandboxLauncher` class creates a multi-layered sandbox using the
`clone()` system call via FFI.

#### Namespace Types

| Namespace   | Flag           | Purpose                    | Isolated |
|------------|----------------|----------------------------|-----------|
| Mount       | `CLONE_NEWNS`  | Filesystem mounts           | ✅        |
| IPC         | `CLONE_NEWIPC`  | System V IPC, POSIX mqs    | ✅        |
| PID         | `CLONE_NEWPID`  | Process IDs                 | ✅        |
| Network     | `CLONE_NEWNET`  | Network interfaces, routing   | ✅        |
| UTS         | `CLONE_NEWUTS`  | Hostname, domain name        | ✅        |

#### Fork Sequence

The sandbox uses a double-fork pattern:

```text
Parent (Bun, PID N)
    |
    +-- fork() --> Child 1 (Sandbox Supervisor, PID N+1)
                       |
                       +-- unshare(namespaces)
                       |
                       +-- fork() --> Child 2 (Sandboxed Worker, PID 1)
                                      |
                                      +-- chroot(/tmp/sandbox_*)
                                      +-- setuid/setgid (if configured)
                                      +-- execvp(worker)
```

Why double-fork?

1. **Child 1** performs `unshare()` to create new namespaces
2. **Child 2** becomes PID 1 in the new PID namespace
3. **Parent** tracks Child 1 as the worker PID
4. If Child 1 dies, Child 2 is automatically killed (via
   `PR_SET_PDEATHSIG`)

#### Filesystem Isolation

The sandbox creates a minimal chroot environment:

```c
// Create new root
mkdir /tmp/sandbox_<random>

// Bind mount essential directories (read-only)
mount("/lib", "/tmp/sandbox_<random>/lib", MS_BIND | MS_RDONLY);
mount("/usr", "/tmp/sandbox_<random>/usr", MS_BIND | MS_RDONLY);
mount("/etc", "/tmp/sandbox_<random>/etc", MS_BIND | MS_RDONLY);

// Mount writable directories
mount("/tmp", "/tmp/sandbox_<random>/tmp", MS_BIND);
mount(cwd, "/tmp/sandbox_<random>" + cwd, MS_BIND);

// Enter chroot
chroot("/tmp/sandbox_<random>");
chdir(cwd);
```

This provides:

- **Read-only system directories**: No modification of `/bin`, `/lib`, `/usr`
- **Writable temp**: Full access to `/tmp` for output files
- **Project access**: Current working directory mounted read-write
- **No escape**: Cannot access parent filesystem paths

### Network Isolation

#### veth Pair Setup (`src/ipc/server.ts`)

The Supervisor creates a virtual ethernet pair connecting host and sandbox:

```bash
# Create veth pair
ip link add veth-bun type veth peer name veth-sb

# Move one end to sandbox namespace
ip link set veth-sb netns <worker-pid>

# Configure host side
ip addr add 169.254.1.1/30 dev veth-bun
ip link set veth-bun up

# Configure sandbox side (via nsenter)
nsenter -t <worker-pid> -n ip addr add 169.254.1.2/30 dev veth-sb
nsenter -t <worker-pid> -n ip link set veth-sb up
nsenter -t <worker-pid> -n ip link set lo up

# Add default route
nsenter -t <worker-pid> -n ip route add default via 169.254.1.1
```

Network topology:

```text
┌─────────────────┐
│   Host         │
│  169.254.1.1  │◄────── veth-bun
│                 │
│   ┌─────────┐   │
│   │ Proxy   │   │
│   │ :8080   │   │
│   └─────────┘   │
└─────────────────┘
        │
        │ veth pair
        │
┌─────────────────┐
│   Sandbox      │
│  169.254.1.2  │◄────── veth-sb
│   ┌─────────┐   │
│   │Worker   │   │
│   └─────────┘   │
└─────────────────┘
```

#### Proxy Routing

All worker traffic is routed through the Supervisor's proxy:

1. **Worker sets environment variables**:

   ```text
   HTTP_PROXY=http://169.254.1.1:8080
   HTTPS_PROXY=http://169.254.1.1:8080
   ```

2. **Python's urllib/requests** automatically uses these proxies

3. **Supervisor's NetworkProxy** evaluates allow/deny lists

4. **Allowed connections** are tunneled to upstream servers

5. **Denied connections** return 403 Forbidden

### Platform Support Matrix

| Feature             | Linux (Native) | Linux (Docker) | macOS      | Notes                          |
|---------------------|-----------------|-------------------|------------|---------------------------------|
| Namespace Isolation | ✅              | ✅                | ❌         | Requires `--privileged` in Docker |
| Network Namespace   | ✅              | ✅                | ❌         | veth pairs need CAP_NET_ADMIN    |
| chroot             | ✅              | ✅                | ❌         | macOS has no chroot              |
| Shared Memory IPC   | ✅              | ✅                | ✅         | Works on all platforms           |
| Policy Enforcement | ✅              | ✅                | ✅         | Core feature, platform-agnostic   |
| Network Proxy      | ✅              | ✅                | ✅         | HTTP/HTTPS only                 |
| Landlock FS sandbox| ✅ (kernel 5.13+) | ⚠️                | ❌         | Optional, not primary isolation  |
| eBPF Telemetry   | ⚠️              | ❌                | ❌         | Partial implementation           |

macOS Limitations:

- No namespace isolation (runs in same process namespace as Supervisor)
- No network isolation (full network access, still proxy-enforced)
- No chroot (full filesystem access, still policy-enforced)
- Policy enforcement still works via IPC hooks
- Suitable for development/testing, not production

## Codebase Structure

```text
src/
├── ipc/                           # IPC implementation
│   ├── server.ts                   # IPCServer class (shm, sockets)
│   ├── ringbuffer.ts               # SharedRingBuffer class
│   ├── protocol.ts                 # MsgType, ResponseType enums
│   ├── telemetry.ts               # IPC telemetry collection
│   └── ffi.ts                     # Bun FFI bindings for POSIX shm
├── sandbox/
│   ├── launcher.ts                 # SandboxLauncher (ns setup)
│   ├── policy/
│   │   ├── enforcer.ts             # PolicyEnforcer (rule eval)
│   │   ├── loader.ts               # PolicyLoader (load/valid)
│   │   ├── set.ts                 # Policy set merging
│   │   └── schema.json            # JSON schema for policies
│   └── telemetry/
│       └── ebpf.ts                # eBPF audit telemetry
├── supervisor/
│   └── supervisor.ts              # Supervisor class (orchestrator)
├── proxy.ts                       # NetworkProxy class
├── config.ts                      # SandboxConfig type and loader
├── cli.ts                         # CLI entry point
├── main.ts                        # Main entry point
├── worker.py                      # Python worker impl
├── worker-bun.ts                 # Bun worker impl
├── shm.c                         # C impl for shared memory
└── tests/                        # Test files
    ├── ipc/
    │   ├── server.test.ts
    │   ├── ringbuffer.test.ts
    │   └── worker-env.test.ts
    ├── sandbox/
    │   └── policy/
    │       └── set.test.ts
    ├── proxy.test.ts
    ├── config.test.ts
    └── index.test.ts

src/policies/                     # Example policies
├── default.json                   # Default policy (deny all)
├── networked.json                # Network-enabled policy
├── no-network.json               # No network access
├── readonly.json                 # Read-only filesystem
├── strict.json                   # Strict security policy
├── exec-policy.json              # Execution control
├── fs-allowlist.json            # Filesystem allowlist
├── net-egress.json              # Network egress rules
├── anti-escape.json             # Anti-escape protections
├── ebpf-audit.json              # eBPF audit configuration
├── active.json                  # Currently active policy (runtime)
└── active.meta.json             # Active policy metadata

example/
├── debug-ui/                    # Web interface
│   ├── index.html
│   ├── styles.css
│   └── app.js
└── (other examples)              # Example usage scripts

docs/
├── ARCHITECTURE.md              # This document
├── POLICIES.md                  # Policy guide
├── DEBUG-UI.md                  # Debug UI guide
├── INTEGRATION.md               # Integration guide
└── DEVELOPMENT.md               # Development guide

libshm.so                         # Compiled shared memory library

package.json
bun.lock
README.md
AGENTS.md
opencode.jsonc
```

## Data Flow Examples

### Code Execution Flow

```text
User Input
    │
    ▼
[CLI/Debug UI] → supervisor.sendCode(code)
    │
    ▼
[Supervisor] → ipcServer.sendOp(MsgType.CODE, encodedCode)
    │
    ▼
[IPCServer.bun2py] → write(code) + "DATA\n" on socket
    │
    ▼
[Worker] → receive on socket, read from ring buffer
    │
    ▼
[Worker] → eval(code) in isolated context
    │
    ├─► stdout.write(result) → ShmOut → py2bun ring buffer
    ├─► open(file) → guarded_open → send_check → wait for response
    ├─► subprocess.run() → guarded_run → send_check → wait for response
    └─► socket.connect() → guarded_connect → send_check → wait for response
    │
    ▼
[Supervisor] → onMessage → emit("output", data)
    │
    ▼
[CLI/Debug UI] → display output
```

### Policy Check Flow

```text
Worker Code
    │
    ▼
[Hook] open("/tmp/test.txt", "w")
    │
    ▼
[PolicyClient] send_sync(MsgType.FS_WRITE, path)
    │
    ▼
[py2bun Ring Buffer] → write(type + reqId + payload)
    │
    ▼
[Unix Socket] → send("CHECK\n")
    │
    ▼
[Supervisor] receive signal → handleData()
    │
    ▼
[IPCServer] → onCheck(type, payload)
    │
    ▼
[PolicyEnforcer] checkFs(path, "write_file")
    │
    ├─► Match rules against path
    ├─► Resolve action (deny/warn/allow)
    └─► Return { allowed: boolean }
    │
    ▼
[IPCServer] sendResponse(reqId, ALLOW or DENY)
    │
    ▼
[bun2py Ring Buffer] → write(response)
    │
    ▼
[Worker] read from ring buffer (blocking)
    │
    ├─► ALLOW → proceed with open()
    └─► DENY → raise PermissionError
```

## Security Considerations

### Supervisor Trust Model

- **Supervisor runs with elevated privileges** (needed for namespaces)
- **Worker runs with reduced privileges** inside sandbox
- **Communication via shared memory** allows Supervisor to inspect all traffic
- **Unix socket provides authenticated channel** (filesystem permissions)

### Attack Surfaces

1. **Shared Memory**: Workers could attempt to corrupt ring buffer headers

   - Mitigation: Supervisor validates all reads and bounds-checks

2. **Unix Socket**: Path disclosure could allow connection hijacking

   - Mitigation: Randomized socket names, strict permissions

3. **Namespace Escape**: Vulnerabilities in kernel namespaces

   - Mitigation: Up-to-date kernel, no capabilities granted to worker

4. **Policy Bypass**: Workers could use alternative syscalls

   - Mitigation: Hooked Python builtins, eBPF audit (partial)

5. **Proxy Bypass**: Workers could bypass HTTP_PROXY env vars

   - Mitigation: Network namespace isolates all traffic except veth

### Known Limitations

- **macOS**: No kernel-level isolation, relies only on policy hooks
- **Python Workers**: Only Python builtins are hooked (not direct C API calls)
- **Network**: Only TCP is proxied (UDP and other protocols not filtered)
- **Process Escape**: Worker could spawn processes that escape the sandbox

  - Mitigation: `exec` policy controls allowed binaries

## Performance Characteristics

### IPC Latency

- **Shared Memory Read**: ~1-2μs (memory access)
- **Shared Memory Write**: ~1-2μs (memory access)
- **Socket Notification**: ~10-50μs (context switch)
- **Policy Check**: ~10-100μs (rule matching)

Total round-trip for policy check: ~100-200μs

### Throughput

- **Ring Buffer Capacity**: ~512KB per direction (1MB total)
- **Max Message Size**: Limited by ring buffer capacity
- **Code Payload**: Can be any size fitting in buffer
- **Output Streaming**: Real-time as generated

### Memory Usage

- **Supervisor**: ~50-100MB base + policy data
- **Shared Memory**: 1MB (configurable)
- **Worker**: ~20-50MB for Python runtime
- **Total**: ~100-200MB per worker instance

## Development Notes

### Adding New Message Types

To add a new message type:

1. Update `MsgType` enum in `src/ipc/protocol.ts`
2. Add handling in `IPCServer.handleData()` in `src/ipc/server.ts`
3. Add hook in worker (e.g., `src/worker.py`)
4. Update policy enforcer if permission check needed

### Testing

Tests are located in `src/tests/`:

```bash
bun test                                    # All tests
bun test src/tests/ipc/server.test.ts         # Single file
bun test -t "ring buffer"                    # Pattern match
bun run test:docker                         # Docker integration tests
```

### Debugging

Enable verbose logging:

```bash
DEBUG=* bun src/main.ts
```

Shared memory debugging:

```bash
# List shared memory segments
ls -la /dev/shm/

# Inspect ring buffer state (via Debug UI)
bun src/main.ts --debug-ui
```
