# Policy Reference

Policies control what operations the sandboxed worker can perform. This document provides a comprehensive reference for the policy system, including schema details, action types, priority resolution, and pre-built policy sets.

## Overview

Buntime policies are JSON-based configuration files that define security constraints for sandboxed execution. Policies control three primary domains:

- **Filesystem (fs)**: File and directory access permissions
- **Network (net)**: Outbound network connection filtering
- **Execution (exec)**: Process execution restrictions

All policies are validated against a JSON Schema (version 1) and are enforced at the kernel level on Linux systems through Landlock (filesystem), seccomp (network/execution), and Linux namespaces.

## Policy Schema Reference

### Top-Level Structure

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
    "net": "allow",
    "exec": "deny"
  },
  "fs": { "rules": [] },
  "net": { "rules": [] },
  "exec": { "rules": [] },
  "antiEscape": {
    "denySyscalls": []
  },
  "audit": {
    "enabled": false,
    "events": []
  }
}
```

#### Network Rule Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `action` | `string` | Yes | `"allow"`, `"deny"`, or `"warn"` |
| `proto` | `string` | Yes | `"tcp"` or `"udp"` |
| `cidr` | `string` | Yes | IP range in CIDR notation |
| `ports` | `string` | Yes | Port specification |

#### Port Specification

The `ports` field accepts comma-separated ports or ranges:

- `"80"`: Single port
- `"80,443,8080"`: Multiple ports
- `"8000-9000"`: Port range
- `"80,443,8000-9000"`: Mixed

Port ranges must be valid (0-65535) and `from <= to`.

#### CIDR Examples

- `"0.0.0.0/0"`: All IPv4 addresses
- `"10.0.0.0/8"`: RFC1918 private network (10.x.x.x)
- `"172.16.0.0/12"`: RFC1918 private network (172.16.x.x - 172.31.x.x)
- `"192.168.0.0/16"`: RFC1918 private network (192.168.x.x)
- `"169.254.169.254/32"`: AWS IMDS endpoint

### Execution Rules (exec)

Execution rules control which programs the worker can execute.

```json
{
  "exec": {
    "rules": [
      { "action": "allow", "path": "/usr/bin/python3" },
      { "action": "allow", "path": "/usr/bin/python3.12" },
      { "action": "deny", "path": "/bin/*" }
    ]
  }
}
```

#### Rule Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `action` | `string` | Yes | `"allow"`, `"deny"`, or `"warn"` |
| `path` | `string` | Yes | Executable path (supports glob patterns) |
| `sha256` | `string` | No | Expected SHA256 hash (for additional verification) |

#### Path Matching

- `/usr/bin/python3`: Exact match
- `/bin/*`: Match all executables in `/bin`

### Anti-Escape Rules (antiEscape)

Anti-escape rules block syscalls commonly used for container escapes or privilege escalation.

```json
{
  "antiEscape": {
    "denySyscalls": [
      "ptrace",
      "bpf",
      "mount",
      "umount2",
      "setns",
      "kexec_load",
      "init_module",
      "finit_module",
      "perf_event_open",
      "keyctl",
      "add_key"
    ]
  }
}
```

Default blocked syscalls include:

- `ptrace`: Process tracing and debugging
- `bpf`: Berkeley Packet Filter (can be used for kernel escape)
- `mount`, `umount2`: Filesystem mounting/unmounting
- `setns`: Namespace manipulation
- `kexec_load`: Load a new kernel for execution
- `init_module`, `finit_module`: Load kernel modules
- `perf_event_open`: Performance event access
- `keyctl`, `add_key`: Key management

### Audit Configuration (audit)

Audit logging controls for runtime event monitoring.

```json
{
  "audit": {
    "enabled": true,
    "events": ["connect", "openat", "execve"]
  }
}
```

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `enabled` | `boolean` | `false` | Enable audit logging |
| `events` | `array` | `["connect", "openat", "execve"]` | Events to log |

## Action Types

| Action | Behavior | Use Case |
|--------|----------|----------|
| `allow` | Operation proceeds | Explicitly permitted operations |
| `deny` | Operation blocked, error returned | Security-critical restrictions |
| `warn` | Operation proceeds, logged to console | Monitoring suspicious activity |

### Known Limitation

The `warn` action currently only logs to the server console. It does not appear in the Debug UI or worker output. The IPC protocol lacks a WARN response type, so warnings are treated as ALLOW internally.

This means:
- Warned operations execute successfully
- No visual indication in the Debug UI
- Log messages appear only in the supervisor's server console

## Priority Resolution

When multiple rules match, actions are resolved with this priority:

1. **deny** - Always takes precedence (security-first)
2. **warn** - Second priority (allows but alerts)
3. **allow** - Third priority (explicit permission)
4. **default** - Fallback from `defaults` object

### Resolution Logic

The `resolveAction` function in `enforcer.ts` implements this logic:

```typescript
private resolveAction(actions: Action[], fallback: Action): Action {
  if (actions.includes("deny")) return "deny";
  if (actions.includes("warn")) return "warn";
  if (actions.includes("allow")) return "allow";
  return fallback;
}
```

### Priority Resolution Example

Given these rules:

```json
{
  "defaults": { "fs": "deny" },
  "fs": {
    "rules": [
      { "path": "/tmp/**", "perms": ["read_file"], "action": "allow" },
      { "path": "/tmp/secret", "perms": ["read_file"], "action": "deny" }
    ]
  }
}
```

- Request to read `/tmp/secret`: **deny** (explicit deny rule)
- Request to read `/tmp/file`: **allow** (explicit allow rule)
- Request to read `/home/user/file`: **deny** (no match, uses default)

## Pre-Built Policy Sets

### FSAllowlistPolicy

Restrict filesystem to an explicit allowlist.

**File**: `src/policies/fs-allowlist.json`

**Purpose**: Lambda-like environments with minimal filesystem access.

**Configuration**:

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
    "net": "allow",
    "exec": "allow"
  },
  "fs": {
    "rules": [
      {
        "action": "allow",
        "path": "/tmp",
        "perms": ["read_file", "write_file", "read_dir", "write_dir"]
      },
      {
        "action": "allow",
        "path": "/app",
        "perms": ["read_file", "read_dir", "execute"]
      }
    ]
  }
}
```

**Use Cases**:

- Serverless function execution
- Code runner with restricted file access
- Build systems with isolated workspaces

### NetEgressPolicy

Control outbound network access with RFC1918 blocking.

**File**: `src/policies/net-egress.json`

**Purpose**: Prevent access to internal networks and cloud metadata services.

**Configuration**:

```json
{
  "version": 1,
  "plugins": {
    "namespaces": true,
    "landlock": true,
    "seccomp": true
  },
  "defaults": {
    "fs": "allow",
    "net": "allow",
    "exec": "allow"
  },
  "net": {
    "rules": [
      { "action": "deny", "proto": "tcp", "cidr": "169.254.169.254/32", "ports": "80,443" },
      { "action": "deny", "proto": "tcp", "cidr": "169.254.0.0/16", "ports": "0-65535" },
      { "action": "deny", "proto": "tcp", "cidr": "10.0.0.0/8", "ports": "0-65535" },
      { "action": "deny", "proto": "tcp", "cidr": "172.16.0.0/12", "ports": "0-65535" },
      { "action": "deny", "proto": "tcp", "cidr": "192.168.0.0/16", "ports": "0-65535" },
      { "action": "warn", "proto": "tcp", "cidr": "0.0.0.0/0", "ports": "2222" },
      { "action": "warn", "proto": "tcp", "cidr": "0.0.0.0/0", "ports": "25" },
      { "action": "warn", "proto": "tcp", "cidr": "0.0.0.0/0", "ports": "3306" },
      { "action": "warn", "proto": "tcp", "cidr": "0.0.0.0/0", "ports": "5432" },
      { "action": "warn", "proto": "tcp", "cidr": "0.0.0.0/0", "ports": "6379" }
    ]
  }
}
```

**Blocked**:

- RFC1918 private networks (10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16)
- Link-local address range (169.254.0.0/16)
- AWS IMDS endpoint (169.254.169.254/32)

**Warned Ports**:

- 2222: SSH (non-standard)
- 25: SMTP
- 3306: MySQL
- 5432: PostgreSQL
- 6379: Redis

**Use Cases**:

- Public cloud deployments
- Multi-tenant environments
- Preventing SSRF attacks

### ExecPolicy

Restrict process execution to Python interpreter only.

**File**: `src/policies/exec-policy.json`

**Purpose**: Ensure only the intended interpreter can execute.

**Configuration**:

```json
{
  "version": 1,
  "plugins": {
    "namespaces": true,
    "landlock": true,
    "seccomp": true
  },
  "defaults": {
    "fs": "allow",
    "net": "allow",
    "exec": "deny"
  },
  "exec": {
    "rules": [
      { "action": "allow", "path": "/usr/bin/python3" },
      { "action": "allow", "path": "/usr/bin/python3.12" }
    ]
  }
}
```

**Use Cases**:

- Python code execution services
- Preventing shell access
- Code sandboxing

### AntiEscapePolicy

Block dangerous syscalls that could escape the sandbox.

**File**: `src/policies/anti-escape.json`

**Purpose**: Add an additional layer of syscall-level protection.

**Configuration**:

```json
{
  "version": 1,
  "plugins": {
    "namespaces": true,
    "landlock": true,
    "seccomp": true
  },
  "defaults": {
    "fs": "allow",
    "net": "allow",
    "exec": "allow"
  },
  "antiEscape": {
    "denySyscalls": [
      "ptrace",
      "mount",
      "umount2",
      "bpf",
      "kexec_load",
      "unshare",
      "setns",
      "clone3",
      "init_module",
      "finit_module",
      "perf_event_open",
      "keyctl",
      "add_key"
    ]
  }
}
```

**Use Cases**:

- High-security environments
- Multi-user code execution
- Defense-in-depth strategy

### EBPFAuditPolicy

Audit mode: log all operations without blocking.

**File**: `src/policies/ebpf-audit.json`

**Purpose**: Development, debugging, and security analysis.

**Configuration**:

```json
{
  "version": 1,
  "plugins": {
    "namespaces": true,
    "landlock": true,
    "seccomp": true
  },
  "defaults": {
    "fs": "allow",
    "net": "allow",
    "exec": "allow"
  },
  "audit": {
    "enabled": true,
    "events": ["connect", "openat", "execve"]
  }
}
```

**Use Cases**:

- Development environment
- Security auditing
- Behavior analysis

### LambdaBackendPolicy (Composite)

Production-ready composite policy combining multiple pre-built policies.

**Purpose**: Serverless function execution environments.

**Composition**:

- FSAllowlistPolicy (filesystem restrictions)
- NetEgressPolicy (network egress control)
- ExecPolicy (execution restrictions)

**Use Cases**:

- AWS Lambda-like function execution
- FaaS (Function as a Service) platforms
- Auto-scaling code execution backends

## Policy Composition

Policies can be merged using `mergePolicies()` from `src/sandbox/policy/set.ts`:

```typescript
import { mergePolicies } from "./src/sandbox/policy/set";

const combined = mergePolicies([fsPolicy, netPolicy, execPolicy]);
```

### Merge Behavior

- `version`: Always `1`
- `plugins`: OR logic (if any policy enables a plugin, it remains enabled)
- `defaults`: Most restrictive value wins (`deny` > `allow`)
- `rules`: Arrays are concatenated (no deduplication)
- `antiEscape.denySyscalls`: Sets are merged (union)
- `audit.events`: Sets are merged (union)
- `audit.enabled`: OR logic (if any policy enables audit, it remains enabled)

### Default Resolution

```typescript
function mergeDefault(a: DefaultAction, b: DefaultAction) {
  return a === "deny" || b === "deny" ? "deny" : "allow";
}
```

This means combining a permissive policy (`allow`) with a restrictive policy (`deny`) results in `deny` for that domain.

### Policy Merge Example

```typescript
const policy1 = {
  version: 1,
  plugins: { namespaces: false, landlock: false, seccomp: false },
  defaults: { fs: "allow", net: "allow", exec: "allow" },
  fs: {
    rules: [
      { action: "allow", path: "/tmp", perms: ["read_file"] }
    ]
  }
};

const policy2 = {
  version: 1,
  plugins: { namespaces: true, landlock: true, seccomp: true },
  defaults: { fs: "deny", net: "allow", exec: "deny" },
  fs: {
    rules: [
      { action: "allow", path: "/app", perms: ["read_file"] }
    ]
  }
};

const merged = mergePolicies([policy1, policy2]);
```

Result:

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
    "net": "allow",
    "exec": "deny"
  },
  "fs": {
    "rules": [
      { "action": "allow", "path": "/tmp", "perms": ["read_file"] },
      { "action": "allow", "path": "/app", "perms": ["read_file"] }
    ]
  }
}
```

## Security Guarantees and Limitations

### What Buntime Provides

1. **Policy-based access control**: Granular control over filesystem, network, and execution operations
2. **Shared memory isolation**: Separate memory spaces between supervisor and worker
3. **Network traffic inspection**: TCP proxy with allowlist/denylist filtering
4. **Linux namespace isolation**: Mount, network, PID, UTS, and IPC namespaces (Linux only)
5. **Landlock enforcement**: Kernel-level filesystem access control (Linux 5.13+)
6. **seccomp syscall filtering**: Restrict dangerous syscalls via seccomp (Linux only)

### What Buntime Does NOT Provide

1. **Protection against kernel exploits**: If the kernel itself is vulnerable, Buntime cannot prevent exploitation
2. **Hardware-level isolation**: Not a virtual machine - shares the same kernel as the host
3. **Protection against timing attacks or side channels**: Information disclosure via timing is possible
4. **macOS sandbox enforcement**: On macOS, policies are validated but not enforced at the kernel level
5. **Memory safety guarantees**: The worker can still corrupt its own memory or cause DoS

### Known Limitations

1. **warn action visibility**: The `warn` action only logs to the server console. It does not appear in the Debug UI or worker output because the IPC protocol lacks a WARN response type.

2. **Landlock requirements**: Landlock requires Linux kernel 5.13 or later. On older kernels, filesystem enforcement is limited.

3. **Privilege requirements**: Full namespace isolation requires `--privileged` flag in Docker. Without it, some isolation features are unavailable.

4. **Network proxy limitations**: The network proxy primarily handles TCP. UDP support is limited.

5. **Path matching semantics**: Filesystem rules use prefix matching (`startsWith`), not glob matching in the traditional sense. This means `/tmp` matches both `/tmp` and `/tmpfile`.

6. **No seccomp-unotify support**: The schema mentions seccomp-unnotify for network and execution enforcement, but this feature is planned but not currently implemented.

### Platform-Specific Behavior

| Platform | Namespaces | Landlock | seccomp | Notes |
|----------|-----------|----------|---------|-------|
| Linux (native) | Full | Yes (5.13+) | Yes | Full isolation |
| Linux (Docker) | Full | Yes (5.13+) | Yes | Requires `--privileged` |
| macOS | None | No | No | Policy validation only |

## Example: Custom Policy for Data Processing

This policy demonstrates a typical data processing scenario:

- Read from `/data/input`
- Write to `/data/output`
- Temporary work in `/tmp`
- Allow HTTPS outbound only
- Only Python interpreter can execute

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
  "fs": {
    "rules": [
      {
        "action": "allow",
        "path": "/data/input",
        "perms": ["read_file", "read_dir"]
      },
      {
        "action": "allow",
        "path": "/data/output",
        "perms": ["write_file", "write_dir", "make_dir", "make_reg"]
      },
      {
        "action": "allow",
        "path": "/tmp",
        "perms": ["read_file", "write_file", "read_dir", "write_dir", "remove_file"]
      }
    ]
  },
  "net": {
    "rules": [
      {
        "action": "deny",
        "proto": "tcp",
        "cidr": "10.0.0.0/8",
        "ports": "0-65535"
      },
      {
        "action": "deny",
        "proto": "tcp",
        "cidr": "172.16.0.0/12",
        "ports": "0-65535"
      },
      {
        "action": "deny",
        "proto": "tcp",
        "cidr": "192.168.0.0/16",
        "ports": "0-65535"
      },
      {
        "action": "deny",
        "proto": "tcp",
        "cidr": "169.254.169.254/32",
        "ports": "80,443"
      },
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

## CLI Usage

Policies can be applied via the CLI:

```bash
# Run with a specific policy file
bunx python-ipc-bun run --policy=src/policies/default.json main.ts

# Override defaults with CLI flags
bunx python-ipc-bun run --allow-net=github.com,jsr.io --allow-write=/tmp main.ts

# Generate policy boilerplate
bunx python-ipc-bun init-policy --allow-net=google.com --allow-read=/tmp > my-policy.json
```

## Validation

Policies are validated during loading using the JSON Schema defined in `src/sandbox/policy/schema.json`. Invalid policies will be rejected with an error message describing the validation failure.

Additional validation includes:

- CIDR format validation for network rules
- Port range validation (0-65535, from <= to)
- Path normalization

For more information on the implementation details, see:

- `src/sandbox/policy/schema.json` - JSON Schema definition
- `src/sandbox/policy/loader.ts` - Policy loading and normalization
- `src/sandbox/policy/enforcer.ts` - Policy enforcement and action resolution
- `src/sandbox/policy/set.ts` - Policy composition and merging
