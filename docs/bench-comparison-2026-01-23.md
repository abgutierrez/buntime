# Benchmark Comparison (perf branches)

## Configuration

- Script: `example/bench/security_compare.ts`
- BENCH_CLI=bun
- BENCH_RUNS=1
- BENCH_ITER_FS=300
- BENCH_ITER_NET=3
- BENCH_FS_OPS=150
- BENCH_NET_OPS=4
- BENCH_NET_TIMEOUT_MS=150
- IPC_SOCKET_DIR=/tmp
- libshm.so built with `cc -shared -o libshm.so -fPIC src/shm.c` and copied to all worktrees

## Aggregate results (avg_mean / max_max, ms)

| Branch                             | Status | Native avg/max | Policy on avg/max | Policy off avg/max |
| ---------------------------------- | ------ | -------------- | ----------------- | ------------------ |
| master                             | ok     | 32.26 / 32.85  | 303.88 / 334.15   | 294.71 / 297.24    |
| perf/v1-policy-cache-mtime         | ok     | 28.77 / 34.58  | 308.55 / 327.27   | 301.72 / 319.55    |
| perf/v10-combo-cache-batch-profile | ok     | 27.39 / 34.79  | 296.85 / 299.48   | 302.46 / 303.76    |
| perf/v2-policy-cache-ttl           | ok     | 27.48 / 32.03  | 298.83 / 302.82   | 309.66 / 330.64    |
| perf/v3-policy-compile-net         | ok     | 25.31 / 29.26  | 289.11 / 292.52   | 297.55 / 306.83    |
| perf/v4-policy-compile-fs          | ok     | 36.08 / 58.51  | 314.17 / 328.09   | 306.40 / 319.45    |
| perf/v5-ipc-batch-signal           | ok     | 24.58 / 28.04  | 290.84 / 300.23   | 292.93 / 294.76    |
| perf/v6-ipc-backoff                | ok     | 25.10 / 29.70  | 295.40 / 300.83   | 292.25 / 296.27    |
| perf/v7-proxy-buffer-chunks        | ok     | 24.78 / 27.51  | 297.56 / 320.63   | 290.99 / 293.92    |
| perf/v8-ringbuffer-reuse           | ok     | 24.61 / 28.93  | 289.09 / 295.63   | 292.81 / 294.19    |
| perf/v9-proxy-bypass-allowall      | ok     | 24.51 / 30.19  | 288.84 / 291.40   | 287.64 / 287.87    |

## Notes

- Raw logs: `/tmp/bench-security-clean-zideu7vv/*.log`

| Scenario          | Baseline | POLICY_OPT=cache | POLICY_OPT=cache,precompile | Cache vs Baseline | Cache+Pre vs Baseline |
| ----------------- | -------- | ---------------- | --------------------------- | ----------------- | --------------------- |
| fs_read           | 433.73   | 407.23           | 409.86                      | -26.50 (-6.1%)    | -23.87 (-5.5%)        |
| net_connect       | 407.33   | 417.35           | 403.09                      | +10.02 (+2.5%)    | -4.24 (-1.0%)         |
| validation_stress | 405.05   | 407.88           | 420.07                      | +2.83 (+0.7%)     | +15.02 (+3.7%)        |
