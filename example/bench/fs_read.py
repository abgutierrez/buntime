import os
import time


def main():
    path = os.environ.get("BENCH_PATH", "/tmp/bench.txt")
    iterations = int(os.environ.get("BENCH_ITER", "500"))
    payload = "x" * 1024
    errors = 0

    try:
        with open(path, "w", encoding="utf-8") as handle:
            handle.write(payload)
    except Exception as exc:
        print(f"[Bench] write failed: {exc}")

    start = time.perf_counter()
    for _ in range(iterations):
        try:
            with open(path, "r", encoding="utf-8") as handle:
                handle.read()
        except Exception:
            errors += 1
    elapsed_ms = (time.perf_counter() - start) * 1000

    print(f"[Bench] fs_read elapsed_ms={elapsed_ms:.2f} errors={errors}")


if __name__ == "__main__":
    main()
