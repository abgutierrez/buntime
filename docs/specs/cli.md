# CLI Specification: Pod/Runner

## 1. Overview
The `python-ipc-bun` CLI provides a unified interface for running sandboxed
worker scripts (Bun/Python/C-lib processes) with fine-grained permission control.

## 2. Commands

### `run`
Executes a script within a sandboxed pod.

**Usage:**
```bash
python-ipc-bun run [options] <entry> [args...]
bunx python-ipc-bun run [options] <entry> [args...]
```

**Options:**
- `--allow-net[=<hosts>]`: Allow network access to hosts. Comma-separated.
- `--deny-net[=<hosts>]`: Deny network access to hosts.
- `--allow-read[=<paths>]`: Allow reading from paths.
- `--deny-read[=<paths>]`: Deny reading from paths.
- `--allow-write[=<paths>]`: Allow writing to paths.
- `--deny-write[=<paths>]`: Deny writing to paths.
- `--allow-env[=<vars>]`: Allow reading env vars.
- `--deny-env[=<vars>]`: Deny reading env vars.
- `--allow-run[=<cmds>]`: Allow subprocess execution.
- `--deny-run[=<cmds>]`: Deny subprocess execution.
- `--allow-ffi[=<paths>]`: Allow dynamic library loading.
- `--deny-ffi[=<paths>]`: Deny dynamic library loading.
- `--allow-sys[=<apis>]`: Allow system info APIs.
- `--deny-sys[=<apis>]`: Deny system info APIs.
- `--allow-all`: Disable sandboxing (equivalent to full access).
- `--policy <file>`: Load security policy from a JSON file.
- `--shm-size <size>`: Set shared memory ring buffer size (e.g., `10mb`, `1gb`).
- `--worker <type>`: `bun|python|exec` (default: python).
- `--no-sandbox`: Run without Linux namespace isolation (dev mode).
- `--debug-ui`: Enable the debug dashboard.

### `init-policy`
Generates a boilerplate policy file based on provided flags.

**Usage:**
```bash
python-ipc-bun init-policy --allow-net=google.com --allow-read=/tmp > my-policy.json
```

## 3. Flag Precedence
Permissions are evaluated in the following order (highest to lowest):
1. **CLI Flags**: Explicit `--allow-*` or `--deny-*` flags.
2. **Policy File**: Settings defined in the file provided via `--policy`.
3. **Defaults**: Hardcoded "secure-by-default" (deny all) settings.

*Example*: If a policy file allows `github.com` but the CLI flag is `--deny-net=github.com`, access to `github.com` will be denied.

## 4. Examples

**Basic execution (Strict):**
```bash
# Denies all network and filesystem access by default
python-ipc-bun run main.ts
```

**Allow specific network access:**
```bash
bunx python-ipc-bun run --allow-net=github.com,jsr.io main.ts
```

**Using a policy file with overrides:**
```bash
python-ipc-bun run --policy=src/policies/default.json --allow-write=/tmp main.ts
```

## 5. Entrypoint Integration
The CLI can be used as a Docker entrypoint, allowing policy parameters to be
passed via environment variables or command-line arguments.

```bash
# In Dockerfile
ENTRYPOINT ["python-ipc-bun", "run"]
CMD ["main.ts"]
```
