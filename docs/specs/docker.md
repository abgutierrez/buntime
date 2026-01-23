# Docker Specification: Pod/Runner

## 1. Overview
The Docker integration for Pod/Runner ensures that the Supervisor and Worker are
isolated from the host, and that security policies are enforced at the container
boundary.

## 2. Multi-Stage Dockerfile
A recommended multi-stage build separates the build environment from the lean runtime environment.

```dockerfile
# --- Stage 1: Build ---
FROM oven/bun:1.3.6 AS builder
WORKDIR /app
COPY . .
RUN bun install
RUN gcc -shared -o libshm.so -fPIC src/shm.c -lrt

# --- Stage 2: Runtime ---
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

## 3. Policy Mapping via Environment Variables
To avoid leaking security policies to the untrusted worker, the Supervisor reads
policy configuration from environment variables prefixed with `POD_`.

- `POD_ALLOW_NET`: Maps to `--allow-net`
- `POD_DENY_NET`: Maps to `--deny-net`
- `POD_ALLOW_READ`: Maps to `--allow-read`
- `POD_DENY_READ`: Maps to `--deny-read`
- `POD_ALLOW_WRITE`: Maps to `--allow-write`
- `POD_DENY_WRITE`: Maps to `--deny-write`
- `POD_ALLOW_ENV`: Maps to `--allow-env`
- `POD_DENY_ENV`: Maps to `--deny-env`
- `POD_ALLOW_RUN`: Maps to `--allow-run`
- `POD_DENY_RUN`: Maps to `--deny-run`
- `POD_ALLOW_FFI`: Maps to `--allow-ffi`
- `POD_DENY_FFI`: Maps to `--deny-ffi`
- `POD_ALLOW_SYS`: Maps to `--allow-sys`
- `POD_DENY_SYS`: Maps to `--deny-sys`
- `POD_POLICY_JSON`: B64 encoded policy string (alternative to file)

### Worker Env Scrubbing
The Supervisor MUST scrub these `POD_` variables before spawning the worker
process. Only non-sensitive variables (like `PYTHONUNBUFFERED`) are passed.

## 4. Entrypoint and Overrides
The Docker image is designed to be highly configurable via `docker run` flags.

**Example: Override policy at runtime**
```bash
docker run --rm --privileged \
  -e POD_ALLOW_NET=api.google.com \
  bun-ipc-demo --allow-write=/tmp/output
```

**Example: Custom Python script entrypoint**
```bash
docker run --rm --privileged \
  bun-ipc-demo run custom_worker.py
```

## 5. Network Configuration
When running in Docker, the `--privileged` flag is required to allow the Supervisor to create veth pairs and manipulate network namespaces inside the container.

- **Supervisor IP**: `169.254.1.1` (on `veth-bun`)
- **Worker IP**: `169.254.1.2` (on `veth-sb`)
- **Proxy Port**: `8080` (accessible from Worker via Supervisor IP)
