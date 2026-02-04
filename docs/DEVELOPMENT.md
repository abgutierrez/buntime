# Development Guide

This guide is for contributors and developers working on the buntime project. It covers
development environment setup, testing strategy, project structure, and contribution
guidelines.

For code style conventions and detailed architecture information, refer to [AGENTS.md](../AGENTS.md).

## Development Environment Setup

### Prerequisites

- **Bun** 1.3.6+ or later
- **Python** 3.10+ or later
- **GCC** (for compiling libshm.so)
- **Docker** (optional, required for full sandbox testing on macOS)

### Installation

```bash
# Clone the repository
git clone <repo>
cd buntime

# Install dependencies
bun install

# Build the shared memory library
gcc -shared -o libshm.so -fPIC src/shm.c -lrt

# Verify installation by running tests
bun test
```

## Running the Project

### Development Mode

```bash
# Local run
bun src/main.ts

# Watch mode with hot reload
bun --hot ./src/main.ts

# With specific policy file
POLICY_FILE=src/policies/strict.json bun src/main.ts

# With debug UI enabled
bun src/main.ts --debug-ui
```

### Docker Mode (Linux Sandbox)

```bash
# Build and run using Docker Compose (recommended)
bun run app:docker

# Watch mode with Docker Compose
bun run app:docker:watch
```

## Testing

This project uses a multi-phase testing strategy as defined in [TESTING_PLAN.md](../TESTING_PLAN.md).

### Running Tests

```bash
# Run all tests
bun test

# Run specific test file
bun test src/tests/ipc/server.test.ts

# Run tests matching a pattern
bun test -t "policy"

# Docker integration tests (requires Docker, --privileged)
bun run test:docker
```

### Test Categories

- **Unit tests**: Located in `src/tests/` - Test policy evaluation, IPC protocol, and individual components
- **Integration tests**: Located in `src/tests/ipc/` - Test full IPC flow with workers
- **Docker tests**: Full sandbox testing with Linux namespaces and kernel features

### Test Coverage Areas

| Domain | Example Script | Policy File | Expected Behavior |
|--------|----------------|-------------|------------------|
| Filesystem | `fs_allow_tmp.py` | `fs-allowlist.json` | Allows `/tmp`, denies `/etc/hosts` |
| Network | `net_rfc1918_block.py` | `net-egress.json` | Blocks RFC1918 ranges, allows public IPs |
| Execution | `exec_deny_shell.py` | `exec-policy.json` | Allows `/usr/bin/python3.12`, denies `/bin/sh` |

## Project Structure

```
buntime/
├── src/
│   ├── ipc/                 # IPC implementation
│   │   ├── server.ts        # IPC server with shared memory
│   │   ├── ringbuffer.ts    # Ring buffer implementation
│   │   └── protocol.ts      # Message types
│   ├── sandbox/
│   │   ├── launcher.ts      # Linux namespace setup
│   │   ├── policy/          # Policy enforcement
│   │   │   ├── enforcer.ts  # Rule evaluation
│   │   │   ├── loader.ts    # Policy loading
│   │   │   ├── set.ts       # Policy composition
│   │   │   └── schema.json  # JSON schema
│   │   ├── plugins/         # Kernel plugins (Landlock, seccomp)
│   │   └── telemetry/       # eBPF and observability
│   ├── supervisor/
│   │   └── supervisor.ts    # Main orchestrator
│   ├── proxy.ts             # Network proxy
│   ├── worker.py            # Python worker
│   ├── worker-bun.ts        # Bun worker
│   ├── config.ts            # Configuration types
│   ├── main.ts              # Entry point
│   ├── cli/                 # CLI implementation
│   ├── tests/               # Test files
│   ├── policies/            # Pre-built policy files
│   └── debug-ui/            # Debug UI server and assets
├── example/
│   ├── debug-ui/            # Web interface
│   │   ├── server.ts        # HTTP/WebSocket server
│   │   ├── index.html       # UI implementation
│   │   └── exampleCatalog.ts # Template catalog
│   ├── *.py                 # Example Python scripts (22 templates)
│   └── bench/               # Benchmarking tools
├── docs/                    # Documentation
│   ├── ARCHITECTURE.md
│   ├── POLICIES.md
│   ├── DEBUG-UI.md
│   ├── INTEGRATION.md
│   └── DEVELOPMENT.md       # This file
├── libshm.so               # Compiled shared memory library
├── AGENTS.md               # Code style and conventions
├── TESTING_PLAN.md         # Testing strategy
└── MISSING_FEATURES.md      # Roadmap and gaps
```

## Code Style and Conventions

Refer to [AGENTS.md](../AGENTS.md) for complete guidelines. Key conventions include:

- **Indentation**: 2 spaces
- **Semicolons**: Always
- **Quotes**: Double quotes preferred
- **Types**: Strict TypeScript, no `any` or `@ts-ignore`
- **Naming**:
  - Classes/Types: PascalCase (`IPCServer`, `PolicyLoader`)
  - Functions/Variables: camelCase (`startWorker`, `sharedMemory`)
  - Constants: UPPER_SNAKE_CASE (`DEFAULT_TIMEOUT`)
  - Filenames: kebab-case (`ipc-server.ts`)
- **Bun APIs**: Use native Bun APIs (`Bun.serve()`, `Bun.file()`, `Bun.$`, `bun:ffi`, `bun:test`)

### Error Handling & Logging

Use `try/catch` with specific error types. Log with consistent prefixes:
- `[Bun]` Supervisor lifecycle events
- `[Python]` Worker logs
- `[Audit]` Security events
- `[CLI]` Entrypoint logs

## Example Templates

The project includes 22 example Python scripts in `example/` directory, demonstrating
various policy configurations and use cases.

| Category | Examples |
|----------|----------|
| Basics | `hello_world.py` |
| Filesystem | `fs_allow_tmp.py`, `fs_allow_work.py`, `fs_deny_app.py`, |
|          | `fs_deny_etc.py`, `fs_deny_var_log.py` |
| Network | `net_rfc1918_block.py`, `net_allow_external.py`, |
|          | `net_deny_172_16.py`, `net_deny_192_168.py`, |
|          | `net_deny_metadata.py`, `net_warn_db_ports.py`, |
|          | `net_warn_mysql.py`, `net_warn_ssh.py` |
| Execution | `exec_allow_python.py`, `exec_deny_shell.py`, |
|           | `exec_deny_cat.py`, `exec_deny_ls.py`, `exec_deny_curl.py`, |
|           | `exec_deny_bun.py`, `exec_deny_bash.py` |
| Telemetry | `audit_activity.py` |

### Running Examples

Examples can be run via the Debug UI or directly:

```bash
# Start with debug UI
bun src/main.ts --debug-ui

# Open http://localhost:3000 in browser
# Select a template from the dropdown and run
```

## Known Limitations

Based on [MISSING_FEATURES.md](../MISSING_FEATURES.md), current limitations include:

1. **Warn action visibility**: The `warn` action only logs to server console and is not visible in the Debug UI
2. **macOS sandbox**: No kernel isolation on macOS, only policy enforcement
3. **Landlock requirement**: Linux kernel 5.13+ is required for filesystem sandbox features
4. **eBPF telemetry**: Partial implementation, requires root access
5. **UDP support**: Limited support, TCP proxy is the primary network control mechanism
6. **Single worker**: Only one worker process can run at a time

## Roadmap

Planned features for future releases:

- seccomp-unnotify for syscall interception
- Full eBPF telemetry integration
- WARN response type in IPC protocol with UI visibility
- Multi-worker support
- Policy validation CLI tool
- Enhanced observability dashboards

## Troubleshooting

### libshm.so not found

```bash
# Rebuild the shared memory library
gcc -shared -o libshm.so -fPIC src/shm.c -lrt
```

### Python worker not connecting

```bash
# Verify Python installation
which python3

# Check socket file permissions
ls -la /tmp/bun-*.sock
```

### Docker namespace errors

```bash
# Ensure Docker is run with --privileged flag
docker run --rm --privileged -p 3000:3000 buntime
```

### Tests failing on macOS

Some tests require Linux kernel features for full coverage. Use Docker for complete testing:

```bash
bun run test:docker
```

### Permission denied errors

```bash
# Ensure libshm.so has executable permissions
chmod +x libshm.so

# Check Python script permissions
chmod +x src/worker.py
```

## Contributing

### Contribution Flow

1. Fork the repository
2. Create a feature branch: `git checkout -b feat/my-feature`
3. Follow code style guidelines from [AGENTS.md](../AGENTS.md)
4. Add tests for new functionality
5. Run `bun test` to verify all tests pass
6. Submit a pull request with a clear description

### Commit Message Format

Use conventional commits with semantic prefixes:

```
type(scope): description

# Examples:
feat(ipc): add message compression
fix(policy): correct CIDR matching
docs(readme): update quick start
test(proxy): add edge case coverage
chore(deps): upgrade bun to v1.3.6
refactor(sandbox): simplify namespace setup
```

### Pull Request Guidelines

- Provide a clear description of changes
- Reference related issues if applicable
- Ensure all tests pass
- Update documentation as needed
- Follow the existing code style and conventions

## Additional Resources

- [Architecture Guide](ARCHITECTURE.md) - System design and components
- [Policy Guide](POLICIES.md) - Policy schema and best practices
- [Debug UI Guide](DEBUG-UI.md) - Web interface usage
- [Integration Guide](INTEGRATION.md) - Programmatic usage and deployment
- [AGENTS.md](../AGENTS.md) - Code style and development conventions
- [TESTING_PLAN.md](../TESTING_PLAN.md) - Comprehensive testing strategy
- [MISSING_FEATURES.md](../MISSING_FEATURES.md) - Roadmap and future work
