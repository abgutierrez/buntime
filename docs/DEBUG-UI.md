# Debug UI Guide

## Overview

The Debug UI is a web-based interface for policy testing and telemetry visualization.
It provides real-time monitoring and control of Bun IPC Policy Sandbox, allowing you
to:

- Write and execute Python code in a sandboxed environment
- Configure and test security policies
- Monitor shared memory ring buffer performance
- View live audit events from eBPF telemetry

The Debug UI is available via `--debug-ui` flag and runs on port 3000 by default.

## Starting the Debug UI

```bash
# Basic usage
bun src/main.ts --debug-ui

# Custom port (via environment variable)
PORT=8080 bun src/main.ts --debug-ui

# Open in browser
open http://localhost:3000
```

Once started, navigate to `http://localhost:3000` in your browser. The connection
status indicator in top-right corner will show green when connected.

## UI Layout

The Debug UI consists of the following main panels:

### Left Column - Execution Pane

**Code Editor (top)**: Monaco-style text editor for writing Python code. Features
syntax highlighting with the following colors:

- Keywords: Purple
- Strings: Lime
- Numbers: Blue
- Functions: Amber
- Definitions: Pink
- Comments: Italic gray

**Output Console (bottom)**: Displays execution output and logs. Includes a "CLEAR"
button to remove previous output.

### Right Column - Sidebar

**Policy Panel (top)**: Contains 6 policy cards with enable/disable toggles. Each
card shows:

- Policy name
- Description
- Enable checkbox
- Expandable details (click to expand/collapse)

Above the policy list is a summary showing:

- Current policy set state (Unrestricted, Open, Scoped, Strict, or Legacy)
- Number of active policies
- Default actions (FS, NET, EXEC)
- Total rule count

The "ALL ON" / "ALL OFF" buttons enable or disable all policies at once.

**Execution History (middle)**: Shows recent code executions with:

- Template name or "Custom"
- Duration
- Status indicator (green for success, red for error)

**Telemetry Panel (bottom)**: Three sections:

1. **Ring Buffer A (Supervisor to Executor)**: Shows used/capacity, throughput
   (B/s), and utilization percentage with a progress bar
2. **Ring Buffer B (Executor to Supervisor)**: Same metrics as Ring Buffer A
3. **Syscall Activity**: Heatmap showing counts for connect, openat, and execve
   syscalls
4. **Live Audit Events**: Real-time stream of policy decisions with timestamps and
   syscall information

**Status Bar (bottom)**: Shows connection status for both Supervisor and Executor
components.

## Policy Cards

The Debug UI includes 6 built-in policies:

### FSAllowlistPolicy

- **Description**: Filesystem allowlist (Landlock). Blocks everything by default
  (fs=deny) and only allows specific paths.
- **Default Action**: fs=deny
- **Domains**: fs
- **Rules**:
  - Allow `/usr/lib` with read_file, read_dir permissions
  - Allow `/tmp` with read_file, write_file, read_dir, write_dir permissions

### NetEgressPolicy

- **Description**: Network egress control. Blocks IMDS and private networks
  (RFC1918). Warns on sensitive ports (SSH, SMTP, DB).
- **Default Action**: net=allow
- **Domains**: net
- **Rules**:
  - Deny IMDS (169.254.169.254/32) ports 80, 443
  - Deny link-local (169.254.0.0/16) all ports
  - Deny RFC1918 ranges: 10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16
    all ports
  - Warn on SSH (2222), SMTP (25), MySQL (3306), PostgreSQL (5432),
    Redis (6379) ports

### ExecPolicy

- **Description**: Strict execution policy. Only allows executing the specified Python
  interpreter.
- **Default Action**: exec=deny
- **Domains**: exec
- **Rules**:
  - Allow `/usr/bin/python3.12`

### AntiEscapePolicy

- **Description**: Anti-escape policy. Blocks dangerous syscalls (ptrace, bpf, mount,
  unshare, etc.) to prevent sandbox escapes.
- **Domains**: antiEscape
- **DenySyscalls**: ptrace, mount, umount2, bpf, kexec_load, unshare, setns,
  clone3, init_module, finit_module, perf_event_open, keyctl, add_key

### EBPFAuditPolicy

- **Description**: eBPF audit policy. Logs critical events (connect/openat/execve)
  without blocking them.
- **Domains**: audit
- **Events**: connect, openat, execve
- **Enabled**: true

### LambdaBackendPolicy

- **Description**: Production-ready lambda-like environment. Composite policy with
  filesystem, network, and execution restrictions.
- **Default Actions**: fs=deny, net=allow, exec=deny
- **Domains**: fs, net, exec
- **Rules**:
  - Filesystem: Allow `/tmp` with full permissions, `/var/task` with read
    permissions
  - Network: Deny RFC1918 ranges, allow all other outbound
  - Execution: Allow `/usr/bin/python3`

Each card can be expanded to show and modify:

- Kernel plugin settings (namespaces, landlock, seccomp)
- Default actions for each domain
- Specific rules (action, path/ports, permissions)

## Template Catalog

The Debug UI includes 17 example templates organized into 4 categories via the
dropdown menu:

### Basics

- `hello_world` - Baseline output and environment info (no recommended policies)

### Filesystem

- `fs_allow_tmp` - Allowed filesystem access under FS allowlist (FSAllowlistPolicy)
- `fs_allow_etc` - Read /etc directory entries (FSAllowlistPolicy)
- `fs_deny_etc` - Denied filesystem access outside allowlist (FSAllowlistPolicy)
- `fs_deny_etc_hostname` - Blocked read outside allowlist (FSAllowlistPolicy)

### Network

- `net_rfc1918_block` - Blocked outbound access to private ranges
  (NetEgressPolicy)
- `net_allow_external` - Outbound HTTPS to public endpoint (NetEgressPolicy)
- `net_warn_db_ports` - Connection attempt to DB ports (NetEgressPolicy)
- `net_warn_ssh` - Connection attempt to SSH port (NetEgressPolicy)
- `net_warn_mysql` - Connection attempt to MySQL port (NetEgressPolicy)

### Execution

- `exec_allow_python` - Allowed exec for Python interpreter (ExecPolicy)
- `exec_deny_shell` - Denied exec for /bin/sh (ExecPolicy)
- `exec_deny_cat` - Denied exec for /bin/cat (ExecPolicy)
- `exec_deny_ls` - Denied exec for /bin/ls (ExecPolicy)
- `exec_deny_curl` - Denied exec for curl (ExecPolicy)
- `exec_deny_bun` - Denied exec for bun (ExecPolicy)
- `exec_deny_bash` - Denied exec for /bin/bash (ExecPolicy)

Loading a template automatically:

1. Populates the code editor with the example Python code
2. Enables the recommended policies for that template
3. Updates the policy summary

## API Endpoints

The Debug UI exposes the following HTTP and WebSocket endpoints:

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/` | GET | Serves the Debug UI HTML page |
| `/ws` | WebSocket | Real-time bidirectional communication with the supervisor |
| `/examples` | GET | Returns JSON array of all available templates |
| `/examples/:id` | GET | Returns the Python code content for the specified template |

## WebSocket Protocol

### Client to Server Messages

#### Run Code

```json
{
  "type": "run",
  "code": "print('hello')",
  "policies": [...]
}
```

The `policies` field is optional. When included, the specified policies are applied
before execution.

#### Apply Policy

```json
{
  "type": "apply-policy",
  ...policy configuration
}
```

Applies a policy set without executing code.

#### Stop Execution

```
STOP
```

Stops any running code execution immediately.

### Server to Client Messages

#### Policy Loaded

```json
{
  "type": "policy-loaded",
  "data": { ...policy configuration }
}
```

Sent on connection to provide the initial policy state.

#### Policy Set Loaded

```json
{
  "type": "policy-set-loaded",
  "data": { ...policy metadata }
}
```

Sent after a policy set is loaded.

#### State Update

```json
{
  "type": "state",
  "data": {
    "bun": "Ready" | "Policy Applied"
  }
}
```

Indicates the current supervisor state.

#### Error

```json
{
  "type": "error",
  "data": "Error message description"
}
```

Sent when an error occurs during policy application or other operations.

#### Telemetry Events

Telemetry events are broadcast from the supervisor and include ring buffer stats,
syscall counts, and audit logs. These update the telemetry panel in real-time.

## Telemetry Display

### Ring Buffer Stats

Both ring buffers (A and B) display:

- **USED / CAP**: Current bytes used out of total capacity
- **THROUGHPUT**: Transfer rate in bytes per second
- **UTILIZATION**: Percentage of capacity used, visualized with a progress bar

The progress bar color changes from blue to yellow at high utilization.

### Syscall Activity

Shows a heatmap of syscall counts:

- `connect` - TCP connection attempts
- `openat` - File open attempts
- `execve` - Program execution attempts

Each entry shows a color indicator (intensity increases with count), syscall name, and
count value.

### Live Audit Events

Displays real-time policy decisions including:

- **Time**: Timestamp of the event
- **Syscall**: System call name (e.g., connect, openat)
- **Target**: Resource being accessed (e.g., IP:port, file path)

Only available when eBPF telemetry is enabled (Linux only, requires root).

## Known Limitations

### Warn Action Not Visible

The `warn` policy action only logs to the server console. It does NOT appear in the
Debug UI output console or the audit events panel. The IPC protocol lacks a WARN
response type. To see warn messages, check the server terminal output where Bun is
running.

### Audit Events Require eBPF

The Live Audit Events panel only shows data when eBPF telemetry is enabled. This
requires:

- Linux operating system
- Root privileges
- EBPFAuditPolicy enabled

On macOS or without root, this panel will display "Waiting for events..."

### No Persistent State

Policies and code are not saved between sessions. Refreshing the page resets all policy
settings and the code editor to defaults.

### Single Worker

Only one worker process is supported at a time. Stopping execution terminates the
current worker before a new one can start.

## Workflow Examples

### Example 1: Testing a Network Policy

1. Start the Debug UI: `bun src/main.ts --debug-ui`
2. Open `http://localhost:3000` in your browser
3. Select "Net Deny RFC1918" from the template dropdown
4. Note that NetEgressPolicy is automatically enabled
5. Click the "Run Code" button
6. Observe output: The connection attempt to 10.0.0.1 will be blocked
7. Check the telemetry panel to see the blocked attempt reflected in syscall counts

### Example 2: Custom Policy Testing

1. Write custom Python code in the editor (e.g., network or filesystem operations)
2. Enable the desired policies via the checkboxes in the policy cards
3. Expand policy cards to customize rules (e.g., change allow to deny, modify paths)
4. Click "Run Code"
5. Check the Output Console for execution results
6. Review telemetry metrics to see buffer utilization and syscall activity
7. Use the Execution History to compare results of different policy configurations

### Example 3: Comparing Policies

1. Write code that exercises multiple security domains (e.g., file reads, network
   requests, subprocess execution)
2. Run with no policies enabled (ALL OFF) - note the output
3. Enable all policies (ALL ON) - run again and note blocked operations
4. Enable individual policies one by one to see which domain is affected
5. Compare telemetry metrics between runs

## Keyboard Shortcuts

- `Ctrl+Enter` (or `Cmd+Enter` on macOS): Run the code in the editor
- `Ctrl+S`: No effect - code is not saved to disk

Note: The editor uses the browser's default tab behavior. Use UI controls instead of
relying on keyboard shortcuts for most operations.
