# Benchmark Report

Generated: 2026-01-23T14:37:50.277Z

Runs per iteration size: 1
Iteration sizes: 10, 50, 100, 500

Notes:
- Iteration sizes are applied to all benchmark scenarios (including stress labels).
- Relative comparisons use average elapsed time (lower is faster).

## Benchmarks

## Iterations: 10

| Scenario | Avg ms | Iterations | Avg IPS | Exit | Failures |
| --- | --- | --- | --- | --- | --- |
| `bun_worker_fs` | 293.89 | 10 | 34.03 | 0 | 0 |
| `bun_worker_net` | 5101.35 | 10 | 1.96 | 0 | 0 |
| `native_bun_fs` | 19.59 | 10 | 510.35 | 0 | 0 |
| `native_bun_net` | 407.56 | 10 | 24.54 | 0 | 0 |
| `policy_fs_allow` | 495.04 | 10 | 20.20 | 0 | 0 |
| `policy_fs_allow_stress` | 424.02 | 10 | 23.58 | 0 | 0 |
| `policy_fs_deny` | 445.66 | 10 | 22.44 | 0 | 0 |
| `policy_fs_deny_stress` | 421.99 | 10 | 23.70 | 0 | 0 |
| `policy_fs_warn` | 405.17 | 10 | 24.68 | 0 | 0 |
| `policy_fs_warn_stress` | 450.75 | 10 | 22.19 | 0 | 0 |
| `policy_net_allow` | 417.79 | 10 | 23.94 | 0 | 0 |
| `policy_net_allow_stress` | 417.66 | 10 | 23.94 | 0 | 0 |
| `policy_net_deny` | 411.14 | 10 | 24.32 | 0 | 0 |
| `policy_net_deny_stress` | 429.00 | 10 | 23.31 | 0 | 0 |
| `policy_net_warn` | 439.02 | 10 | 22.78 | 0 | 0 |
| `policy_net_warn_stress` | 428.97 | 10 | 23.31 | 0 | 0 |

**Relative comparisons**
- `native_bun_fs` is x15.00 faster than `bun_worker_fs` (19.59 ms vs 293.89 ms)
- `native_bun_net` is x12.52 faster than `bun_worker_net` (407.56 ms vs 5101.35 ms)
## Iterations: 50

| Scenario | Avg ms | Iterations | Avg IPS | Exit | Failures |
| --- | --- | --- | --- | --- | --- |
| `bun_worker_fs` | 289.74 | 50 | 172.57 | 0 | 0 |
| `bun_worker_net` | 5106.40 | 50 | 9.79 | 0 | 0 |
| `native_bun_fs` | 17.21 | 50 | 2905.21 | 0 | 0 |
| `native_bun_net` | 1808.92 | 50 | 27.64 | 0 | 0 |
| `policy_fs_allow` | 449.21 | 50 | 111.31 | 0 | 0 |
| `policy_fs_allow_stress` | 430.72 | 50 | 116.09 | 0 | 0 |
| `policy_fs_deny` | 416.79 | 50 | 119.96 | 0 | 0 |
| `policy_fs_deny_stress` | 501.12 | 50 | 99.78 | 0 | 0 |
| `policy_fs_warn` | 432.31 | 50 | 115.66 | 0 | 0 |
| `policy_fs_warn_stress` | 30089.81 | 50 | 1.66 | 1 | 1 |
| `policy_net_allow` | 431.50 | 50 | 115.88 | 0 | 0 |
| `policy_net_allow_stress` | 30093.08 | 50 | 1.66 | 1 | 1 |
| `policy_net_deny` | 422.22 | 50 | 118.42 | 0 | 0 |
| `policy_net_deny_stress` | 400.72 | 50 | 124.78 | 0 | 0 |
| `policy_net_warn` | 422.40 | 50 | 118.37 | 0 | 0 |
| `policy_net_warn_stress` | 483.58 | 50 | 103.40 | 0 | 0 |

**Relative comparisons**
- `native_bun_fs` is x16.84 faster than `bun_worker_fs` (17.21 ms vs 289.74 ms)
- `native_bun_net` is x2.82 faster than `bun_worker_net` (1808.92 ms vs 5106.40 ms)
## Iterations: 100

| Scenario | Avg ms | Iterations | Avg IPS | Exit | Failures |
| --- | --- | --- | --- | --- | --- |
| `bun_worker_fs` | 290.41 | 100 | 344.33 | 0 | 0 |
| `bun_worker_net` | 290.10 | 100 | 344.71 | 0 | 0 |
| `native_bun_fs` | 20.43 | 100 | 4894.19 | 0 | 0 |
| `native_bun_net` | 2949.92 | 100 | 33.90 | 0 | 0 |
| `policy_fs_allow` | 431.62 | 100 | 231.69 | 0 | 0 |
| `policy_fs_allow_stress` | 419.08 | 100 | 238.62 | 0 | 0 |
| `policy_fs_deny` | 437.70 | 100 | 228.47 | 0 | 0 |
| `policy_fs_deny_stress` | 439.12 | 100 | 227.73 | 0 | 0 |
| `policy_fs_warn` | 427.04 | 100 | 234.17 | 0 | 0 |
| `policy_fs_warn_stress` | 429.14 | 100 | 233.03 | 0 | 0 |
| `policy_net_allow` | 425.23 | 100 | 235.17 | 0 | 0 |
| `policy_net_allow_stress` | 424.86 | 100 | 235.37 | 0 | 0 |
| `policy_net_deny` | 413.22 | 100 | 242.00 | 0 | 0 |
| `policy_net_deny_stress` | 419.63 | 100 | 238.30 | 0 | 0 |
| `policy_net_warn` | 426.15 | 100 | 234.66 | 0 | 0 |
| `policy_net_warn_stress` | 427.66 | 100 | 233.83 | 0 | 0 |

**Relative comparisons**
- `native_bun_fs` is x14.21 faster than `bun_worker_fs` (20.43 ms vs 290.41 ms)
- `bun_worker_net` is x10.17 faster than `native_bun_net` (290.10 ms vs 2949.92 ms)
## Iterations: 500

| Scenario | Avg ms | Iterations | Avg IPS | Exit | Failures |
| --- | --- | --- | --- | --- | --- |
| `bun_worker_fs` | 287.67 | 500 | 1738.11 | 0 | 0 |
| `bun_worker_net` | 285.63 | 500 | 1750.52 | 0 | 0 |
| `native_bun_fs` | 28.76 | 500 | 17383.97 | 0 | 0 |
| `native_bun_net` | 14047.78 | 500 | 35.59 | 0 | 0 |
| `policy_fs_allow` | 449.94 | 500 | 1111.26 | 0 | 0 |
| `policy_fs_allow_stress` | 413.23 | 500 | 1209.98 | 0 | 0 |
| `policy_fs_deny` | 418.28 | 500 | 1195.36 | 0 | 0 |
| `policy_fs_deny_stress` | 432.54 | 500 | 1155.97 | 0 | 0 |
| `policy_fs_warn` | 430.19 | 500 | 1162.27 | 0 | 0 |
| `policy_fs_warn_stress` | 423.45 | 500 | 1180.77 | 0 | 0 |
| `policy_net_allow` | 433.17 | 500 | 1154.29 | 0 | 0 |
| `policy_net_allow_stress` | 415.34 | 500 | 1203.84 | 0 | 0 |
| `policy_net_deny` | 422.57 | 500 | 1183.23 | 0 | 0 |
| `policy_net_deny_stress` | 410.69 | 500 | 1217.47 | 0 | 0 |
| `policy_net_warn` | 416.78 | 500 | 1199.68 | 0 | 0 |
| `policy_net_warn_stress` | 461.85 | 500 | 1082.61 | 0 | 0 |

**Relative comparisons**
- `native_bun_fs` is x10.00 faster than `bun_worker_fs` (28.76 ms vs 287.67 ms)
- `bun_worker_net` is x49.18 faster than `native_bun_net` (285.63 ms vs 14047.78 ms)

## Coverage

Coverage data was not parsed from `bun test --coverage` output.

```
bun test v1.3.6 (d530ed99)
CWD: /Users/coco/Documents/projects/python-ipc-bun
Loading lib from: /Users/coco/Documents/projects/python-ipc-bun/libshm.so
[Bun] Starting IPC Server...
[Bun] Socket created at /Users/coco/Documents/projects/python-ipc-bun/bun-tev75e23d2i.sock
[Proxy] Starting TCP Proxy on port 8080
[Bun] Network Proxy started on port 8080
[Bun] Spawned Python PID 80455
[Python] Connecting to /Users/coco/Documents/projects/python-ipc-bun/bun-tev75e23d2i.sock...
[Python] Connected to SHM: bun_ipc_test
[Python] Worker Loop Started
[Bun] Python connected!
[Bun] Python is ready
Done
[Bun] Python disconnected


src/index.test.ts:

src/sandbox/policy/set.test.ts:
/Users/coco/.pyenv/versions/3.12.0/lib/python3.12/multiprocessing/resource_tracker.py:224: UserWarning: resource_tracker: There appear to be 1 leaked shared_memory objects to clean up at shutdown
  warnings.warn('resource_tracker: There appear to be %d '
/Users/coco/.pyenv/versions/3.12.0/lib/python3.12/multiprocessing/resource_tracker.py:237: UserWarning: resource_tracker: '/bun_ipc_test': [Errno 2] No such file or directory: '/bun_ipc_test'
  warnings.warn('resource_tracker: %r: %s' % (name, e))
---------------------------|---------|---------|-------------------
File                       | % Funcs | % Lines | Uncovered Line #s
---------------------------|---------|---------|-------------------
All files                  |   64.12 |   50.91 |
 src/config.ts             |  100.00 |   25.00 | 29-31,35-49
 src/ipc/ffi.ts            |   80.00 |   93.18 | 35-36
 src/ipc/ringbuffer.ts     |   36.36 |   23.38 | 12-15,20-23,28-31,39-57,61-76,80-84,88-94
 src/ipc/server.ts         |   58.82 |   63.68 | 102,172-205,209-216,220-225,229-232,236,240-262
 src/proxy.ts              |   42.86 |   12.44 | 20-23,27-37,45-197
 src/sandbox/policy/set.ts |   66.67 |   87.80 | 33-37,49,61-66,73-74
---------------------------|---------|---------|-------------------

 4 pass
 0 fail
 12 expect() calls
Ran 4 tests across 2 files. [5.05s]
```
