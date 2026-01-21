# python-ipc-bun

To install dependencies:

```bash
bun install
```

To run with Linux Sandbox support (requires Docker):

```bash
docker build -t bun-ipc-demo .
# Note: --privileged is required for namespace creation (unshare)
docker run --rm --privileged -p 3000:3000 bun-ipc-demo
```

This project was created using `bun init` in bun v1.3.6. [Bun](https://bun.com) is a fast all-in-one JavaScript runtime.
