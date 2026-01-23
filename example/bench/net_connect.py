import os
import socket
import time


def main():
    host = os.environ.get("BENCH_HOST", "93.184.216.34")
    port = int(os.environ.get("BENCH_PORT", "80"))
    iterations = int(os.environ.get("BENCH_ITER", "200"))
    timeout = float(os.environ.get("BENCH_TIMEOUT", "0.2"))
    errors = 0

    start = time.perf_counter()
    for _ in range(iterations):
        try:
            with socket.create_connection((host, port), timeout=timeout) as sock:
                sock.settimeout(timeout)
        except Exception:
            errors += 1
    elapsed_ms = (time.perf_counter() - start) * 1000

    print(f"[Bench] net_connect elapsed_ms={elapsed_ms:.2f} errors={errors}")


if __name__ == "__main__":
    main()
