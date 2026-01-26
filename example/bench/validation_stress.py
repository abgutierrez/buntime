import os
import socket
import time
import json


def run_file_ops(path, fs_ops, write_every):
    payload = "x" * 1024
    reads = 0
    writes = 0
    errors = 0

    for i in range(fs_ops):
        if i % write_every == 0:
            try:
                with open(path, "w", encoding="utf-8") as handle:
                    handle.write(payload)
                writes += 1
            except Exception:
                errors += 1

        try:
            with open(path, "r", encoding="utf-8") as handle:
                handle.read()
            reads += 1
        except Exception:
            errors += 1

    return {"reads": reads, "writes": writes, "errors": errors}


def run_network_ops(allow_host, deny_host, port, net_ops, timeout):
    allowed = 0
    denied = 0
    errors = 0

    for i in range(net_ops):
        host = allow_host if i % 2 == 0 else deny_host
        try:
            with socket.create_connection((host, port), timeout=timeout) as sock:
                sock.settimeout(timeout)
            allowed += 1
        except PermissionError:
            denied += 1
        except Exception:
            errors += 1

    return {"allowed": allowed, "denied": denied, "errors": errors}


def main():
    bench_path = os.environ.get("BENCH_PATH", "/tmp/bench.txt")
    fs_ops = int(os.environ.get("BENCH_FS_OPS", "200"))
    write_every = int(os.environ.get("BENCH_FS_WRITE_EVERY", "10"))
    net_ops = int(os.environ.get("BENCH_NET_OPS", "10"))
    timeout_ms = float(os.environ.get("BENCH_NET_TIMEOUT_MS", "300"))
    timeout = timeout_ms / 1000

    allow_host = os.environ.get("BENCH_ALLOW_HOST", "localhost")
    deny_host = os.environ.get("BENCH_DENY_HOST", "127.0.0.1")
    target_port = int(os.environ.get("BENCH_TARGET_PORT", "9"))

    fs_start = time.perf_counter()
    fs_stats = run_file_ops(bench_path, fs_ops, write_every)
    fs_elapsed_ms = (time.perf_counter() - fs_start) * 1000

    net_start = time.perf_counter()
    net_stats = run_network_ops(allow_host, deny_host, target_port, net_ops, timeout)
    net_elapsed_ms = (time.perf_counter() - net_start) * 1000

    meta = {
        "proxyMode": "direct",
        "benchPath": bench_path,
        "allowHost": allow_host,
        "denyHost": deny_host,
        "targetPort": target_port,
        "fsOps": fs_ops,
        "fsReads": fs_stats["reads"],
        "fsWrites": fs_stats["writes"],
        "fsErrors": fs_stats["errors"],
        "netOps": net_ops,
        "netAllowed": net_stats["allowed"],
        "netDenied": net_stats["denied"],
        "netErrors": net_stats["errors"],
        "fsElapsedMs": round(fs_elapsed_ms, 2),
        "netElapsedMs": round(net_elapsed_ms, 2),
    }

    print(f"[BenchMeta] {json.dumps(meta)}")
    print(
        "[Bench] validation_stress "
        f"fs_ms={fs_elapsed_ms:.2f} net_ms={net_elapsed_ms:.2f} "
        f"fs_errors={fs_stats['errors']} net_errors={net_stats['errors']}"
    )


if __name__ == "__main__":
    main()
