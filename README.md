# python-ipc-bun

Buntime is a kernel-level sandbox where Bun supervises untrusted Python/Bun
workers using shared memory IPC for high-performance communication and
policy-based security for filesystem, network, and execution control.

## Platform Support

|Platform|Sandbox|IPC|Network|Notes|
|---|---|---|---|---|
|Linux (native)|Full|Yes|Yes|Requires root|
|Linux (Docker)|Full|Yes|Yes|--privileged|
|macOS|None|Yes|Yes|Policy only|

## Quick Start

```bash
# Install dependencies
bun install

# Build shared memory library
gcc -shared -o libshm.so -fPIC src/shm.c -lrt

# Run with debug UI
bun src/main.ts --debug-ui

# Open http://localhost:3000 in browser
```

## Docker Quick Start

```bash
# Build and run with full Linux sandbox
docker build -t buntime .
docker run --rm --privileged -p 3000:3000 buntime
```

## Architecture

```text
┌─────────────────────────────────────────────────────────┐
│                    SUPERVISOR (Bun)                      │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐      │
│  │   Policy    │  │   Network   │  │    Debug    │      │
│  │   Engine    │  │    Proxy    │  │     UI      │      │
│  └─────────────┘  └─────────────┘  └─────────────┘      │
│          │               │                               │
│          ▼               ▼                               │
│  ┌─────────────────────────────────────────────────┐    │
│  │           Shared Memory Ring Buffers            │    │
│  │              (Data Plane - IPC)                 │    │
│  └─────────────────────────────────────────────────┘    │
│          │               │                               │
│          ▼               ▼                               │
│  ┌─────────────────────────────────────────────────┐    │
│  │         Unix Domain Socket (Control Plane)       │    │
│  └─────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────┐
│              WORKER (Python/Bun - Sandboxed)            │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐      │
│  │  Namespace  │  │    IPC      │  │   User      │      │
│  │  Isolation  │  │   Client    │  │   Code      │      │
│  └─────────────┘  └─────────────┘  └─────────────┘      │
└─────────────────────────────────────────────────────────┘
```

## Features

**Policy-Based Security**: JSON policies for filesystem, network, and execution
control with allow, deny, and warn actions.

**High-Performance IPC**: Shared memory ring buffers with u32 length prefixed
payload framing for low-latency bidirectional communication.

**Network Control**: TCP proxy with allowlist/denylist and RFC1918 blocking
for granular network access control.

**Debug UI**: Web interface for policy testing, code execution, and real-time
telemetry.

**Linux Kernel Sandbox**: Namespace isolation for mount, network, PID, UTS,
and IPC namespaces.

## Documentation

- [Architecture](docs/ARCHITECTURE.md) - System design and components
- [Policies](docs/POLICIES.md) - Policy schema and best practices
- [Debug UI](docs/DEBUG-UI.md) - Web interface guide
- [Integration](docs/INTEGRATION.md) - Programmatic usage and deployment
- [Development](docs/DEVELOPMENT.md) - Contributing guidelines

## CLI Usage

```bash
# Run with strict defaults (deny all)
bunx python-ipc-bun run main.ts

# Allow specific network access
bunx python-ipc-bun run --allow-net=github.com,jsr.io main.ts

# Use policy file with CLI overrides
bunx python-ipc-bun run --policy=src/policies/default.json --allow-write=/tmp main.ts

# Generate policy boilerplate
bunx python-ipc-bun init-policy --allow-net=google.com --allow-read=/tmp > my-policy.json
```

## Docker Integration

```bash
# Override policy at runtime
docker run --rm --privileged \
  -e POD_ALLOW_NET=api.google.com \
  buntime --allow-write=/tmp/output

# Custom entrypoint
docker run --rm --privileged \
  buntime run custom_worker.py
```

This project was created using `bun init` in bun v1.3.6. [Bun](https://bun.com)
is a fast all-in-one JavaScript runtime.
