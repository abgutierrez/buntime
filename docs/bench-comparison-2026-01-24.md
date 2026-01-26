# Security Bench Comparison (2026-01-24)

Bench command (baseline):

```
IPC_SOCKET_DIR=/tmp \
BENCH_CLI=bun \
BENCH_WORKER=python \
BENCH_ALLOW_HOST=127.0.0.1 \
BENCH_DENY_HOST=127.0.0.2 \
BENCH_URL=http://127.0.0.1:9 \
BENCH_TARGET_PORT=9 \
BENCH_RUNS=3 \
BENCH_ITER_FS=300 \
BENCH_ITER_NET=3 \
BENCH_FS_OPS=150 \
BENCH_NET_OPS=4 \
BENCH_NET_TIMEOUT_MS=150 \
bun run bench:security
```

Alternatives:
- Cache only: `POLICY_OPT=cache`
- Cache + precompile: `POLICY_OPT=cache,precompile`

## Policy-on Comparison (avg ms)

| Scenario | Baseline | Cache | Cache + Precompile | Cache vs Baseline | Cache+Precompile vs Baseline |
| --- | --- | --- | --- | --- | --- |
| fs_read | 433.73 | 407.23 | 409.86 | -26.50 (-6.1%) | -23.87 (-5.5%) |
| net_connect | 407.33 | 417.35 | 403.09 | +10.02 (+2.5%) | -4.24 (-1.0%) |
| validation_stress | 405.05 | 407.88 | 420.07 | +2.83 (+0.7%) | +15.02 (+3.7%) |

Notes:
- Results are from `BENCH_RUNS=3` without profiling overhead.
- Hot spots from the earlier profiles are still `policy.load` and `hook.open`.
