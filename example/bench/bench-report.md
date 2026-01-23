# Benchmark Report

Generated: 2026-01-23T19:39:15.062Z

Runs per iteration size: 1
Iteration sizes: 10, 50, 100, 500

Notes:
- Iteration sizes are applied to all benchmark scenarios (including stress labels).
- Relative comparisons use average elapsed time (lower is faster).

## Benchmarks

## Iterations: 10

| Scenario | Avg ms | Iterations | Avg IPS | Exit | Failures |
| --- | --- | --- | --- | --- | --- |
| `bun_worker_fs` | 293.21 | 10 | 34.10 | 0 | 0 |
| `bun_worker_net` | 5105.44 | 10 | 1.96 | 0 | 0 |
| `native_bun_fs` | 20.38 | 10 | 490.69 | 0 | 0 |
| `native_bun_net` | 383.67 | 10 | 26.06 | 0 | 0 |
| `policy_fs_allow` | 465.89 | 10 | 21.46 | 0 | 0 |
| `policy_fs_allow_stress` | 409.82 | 10 | 24.40 | 0 | 0 |
| `policy_fs_deny` | 414.03 | 10 | 24.15 | 0 | 0 |
| `policy_fs_deny_stress` | 409.23 | 10 | 24.44 | 0 | 0 |
| `policy_fs_warn` | 408.72 | 10 | 24.47 | 0 | 0 |
| `policy_fs_warn_stress` | 404.44 | 10 | 24.73 | 0 | 0 |
| `policy_net_allow` | 420.53 | 10 | 23.78 | 0 | 0 |
| `policy_net_allow_stress` | 30091.13 | 10 | 0.33 | 1 | 1 |
| `policy_net_deny` | 418.78 | 10 | 23.88 | 0 | 0 |
| `policy_net_deny_stress` | 416.47 | 10 | 24.01 | 0 | 0 |
| `policy_net_warn` | 406.62 | 10 | 24.59 | 0 | 0 |
| `policy_net_warn_stress` | 489.86 | 10 | 20.41 | 0 | 0 |

**Relative comparisons**
- `native_bun_fs` is x14.39 faster than `bun_worker_fs` (20.38 ms vs 293.21 ms)
- `native_bun_net` is x13.31 faster than `bun_worker_net` (383.67 ms vs 5105.44 ms)
## Iterations: 50

| Scenario | Avg ms | Iterations | Avg IPS | Exit | Failures |
| --- | --- | --- | --- | --- | --- |
| `bun_worker_fs` | 288.58 | 50 | 173.26 | 0 | 0 |
| `bun_worker_net` | 285.90 | 50 | 174.89 | 0 | 0 |
| `native_bun_fs` | 21.33 | 50 | 2344.38 | 0 | 0 |
| `native_bun_net` | 1565.78 | 50 | 31.93 | 0 | 0 |
| `policy_fs_allow` | 415.60 | 50 | 120.31 | 0 | 0 |
| `policy_fs_allow_stress` | 407.39 | 50 | 122.73 | 0 | 0 |
| `policy_fs_deny` | 413.95 | 50 | 120.79 | 0 | 0 |
| `policy_fs_deny_stress` | 410.78 | 50 | 121.72 | 0 | 0 |
| `policy_fs_warn` | 412.58 | 50 | 121.19 | 0 | 0 |
| `policy_fs_warn_stress` | 407.50 | 50 | 122.70 | 0 | 0 |
| `policy_net_allow` | 420.91 | 50 | 118.79 | 0 | 0 |
| `policy_net_allow_stress` | 418.22 | 50 | 119.55 | 0 | 0 |
| `policy_net_deny` | 418.60 | 50 | 119.45 | 0 | 0 |
| `policy_net_deny_stress` | 412.34 | 50 | 121.26 | 0 | 0 |
| `policy_net_warn` | 417.31 | 50 | 119.81 | 0 | 0 |
| `policy_net_warn_stress` | 427.13 | 50 | 117.06 | 0 | 0 |

**Relative comparisons**
- `native_bun_fs` is x13.53 faster than `bun_worker_fs` (21.33 ms vs 288.58 ms)
- `bun_worker_net` is x5.48 faster than `native_bun_net` (285.90 ms vs 1565.78 ms)
## Iterations: 100

| Scenario | Avg ms | Iterations | Avg IPS | Exit | Failures |
| --- | --- | --- | --- | --- | --- |
| `bun_worker_fs` | 285.21 | 100 | 350.62 | 0 | 0 |
| `bun_worker_net` | 286.48 | 100 | 349.06 | 0 | 0 |
| `native_bun_fs` | 23.16 | 100 | 4317.03 | 0 | 0 |
| `native_bun_net` | 3139.85 | 100 | 31.85 | 0 | 0 |
| `policy_fs_allow` | 411.75 | 100 | 242.87 | 0 | 0 |
| `policy_fs_allow_stress` | 415.63 | 100 | 240.60 | 0 | 0 |
| `policy_fs_deny` | 426.50 | 100 | 234.47 | 0 | 0 |
| `policy_fs_deny_stress` | 406.32 | 100 | 246.11 | 0 | 0 |
| `policy_fs_warn` | 412.12 | 100 | 242.65 | 0 | 0 |
| `policy_fs_warn_stress` | 403.67 | 100 | 247.73 | 0 | 0 |
| `policy_net_allow` | 407.17 | 100 | 245.60 | 0 | 0 |
| `policy_net_allow_stress` | 406.31 | 100 | 246.11 | 0 | 0 |
| `policy_net_deny` | 407.17 | 100 | 245.60 | 0 | 0 |
| `policy_net_deny_stress` | 408.67 | 100 | 244.70 | 0 | 0 |
| `policy_net_warn` | 409.70 | 100 | 244.08 | 0 | 0 |
| `policy_net_warn_stress` | 411.38 | 100 | 243.08 | 0 | 0 |

**Relative comparisons**
- `native_bun_fs` is x12.31 faster than `bun_worker_fs` (23.16 ms vs 285.21 ms)
- `bun_worker_net` is x10.96 faster than `native_bun_net` (286.48 ms vs 3139.85 ms)
## Iterations: 500

| Scenario | Avg ms | Iterations | Avg IPS | Exit | Failures |
| --- | --- | --- | --- | --- | --- |
| `bun_worker_fs` | 293.66 | 500 | 1702.67 | 0 | 0 |
| `bun_worker_net` | 5143.26 | 500 | 97.21 | 0 | 0 |
| `native_bun_fs` | 32.89 | 500 | 15203.25 | 0 | 0 |
| `native_bun_net` | 14710.53 | 500 | 33.99 | 0 | 0 |
| `policy_fs_allow` | 420.52 | 500 | 1189.01 | 0 | 0 |
| `policy_fs_allow_stress` | 403.80 | 500 | 1238.23 | 0 | 0 |
| `policy_fs_deny` | 428.14 | 500 | 1167.85 | 0 | 0 |
| `policy_fs_deny_stress` | 402.30 | 500 | 1242.86 | 0 | 0 |
| `policy_fs_warn` | 413.92 | 500 | 1207.95 | 0 | 0 |
| `policy_fs_warn_stress` | 420.71 | 500 | 1188.45 | 0 | 0 |
| `policy_net_allow` | 427.00 | 500 | 1170.95 | 0 | 0 |
| `policy_net_allow_stress` | 419.97 | 500 | 1190.56 | 0 | 0 |
| `policy_net_deny` | 410.17 | 500 | 1218.99 | 0 | 0 |
| `policy_net_deny_stress` | 417.65 | 500 | 1197.16 | 0 | 0 |
| `policy_net_warn` | 418.73 | 500 | 1194.10 | 0 | 0 |
| `policy_net_warn_stress` | 411.06 | 500 | 1216.37 | 0 | 0 |

**Relative comparisons**
- `native_bun_fs` is x8.93 faster than `bun_worker_fs` (32.89 ms vs 293.66 ms)
- `bun_worker_net` is x2.86 faster than `native_bun_net` (5143.26 ms vs 14710.53 ms)

## Coverage

Coverage data was not parsed from `bun test --coverage` output.

```
bun test v1.3.6 (d530ed99)
CWD: /Users/coco/Documents/projects/execution-policies-bun
Loading lib from: /Users/coco/Documents/projects/execution-policies-bun/libshm.so
[Bun] Starting IPC Server...
[Bun] Socket created at /Users/coco/Documents/projects/execution-policies-bun/bun-fsl6s1ebg4.sock
[Proxy] Starting TCP Proxy on port 8080
[Bun] Network Proxy started on port 8080
[Bun] Spawned Python PID 88117
[Python] Connecting to /Users/coco/Documents/projects/execution-policies-bun/bun-fsl6s1ebg4.sock...
[Python] Connected to SHM: execution-policies-bun
[Python] Worker Loop Started
[Bun] Python connected!
[Bun] Python is ready
Done
[Bun] Python disconnected
[Proxy] Starting TCP Proxy on port 0
[Proxy] CONNECT 127.0.0.1:50705
[Proxy] Tunnel established to 127.0.0.1
[Proxy] Starting TCP Proxy on port 0
[Proxy] CONNECT 127.0.0.1:443
[Proxy] Starting TCP Proxy on port 0
[Proxy] HTTP Request: 127.0.0.1
[Bun] Starting IPC Server...
[Bun] Socket created at /Users/coco/Documents/projects/execution-policies-bun/bun-kzopy21msu.sock
[Bun] Spawned Python PID 88155
[Bun] Python connected!
[Bun] Python is ready
[Bun] Python disconnected


src/tests/index.test.ts:

src/tests/proxy.test.ts:
(pass) proxy helpers > evaluateHostAccess honors allow list [0.23ms]
(pass) proxy helpers > evaluateHostAccess denies explicit block [0.07ms]
(pass) proxy helpers > parseConnectTarget defaults port [0.15ms]
(pass) proxy helpers > parseHttpRequestTarget parses absolute URL [0.15ms]
/Users/coco/.pyenv/versions/3.12.0/lib/python3.12/multiprocessing/resource_tracker.py:224: UserWarning: resource_tracker: There appear to be 1 leaked shared_memory objects to clean up at shutdown
  warnings.warn('resource_tracker: There appear to be %d '
/Users/coco/.pyenv/versions/3.12.0/lib/python3.12/multiprocessing/resource_tracker.py:237: UserWarning: resource_tracker: '/execution-policies-bun': [Errno 2] No such file or directory: '/execution-policies-bun'
  warnings.warn('resource_tracker: %r: %s' % (name, e))
(pass) proxy helpers > parseHttpRequestTarget falls back to Host header [0.19ms]
(pass) proxy socket flows > CONNECT forwards data for allowed host [22.81ms]
[Proxy] BLOCKED: 127.0.0.1
(pass) proxy socket flows > CONNECT denies blocked host [11.78ms]
(pass) proxy socket flows > HTTP request forwards and rewrites request line [11.67ms]

src/tests/config.test.ts:
(pass) loadConfig > returns defaults when file is missing [0.05ms]
(pass) loadConfig > loads config from file [5.40ms]

src/tests/ipc/ringbuffer.test.ts:
(pass) SharedRingBuffer > returns null when empty
(pass) SharedRingBuffer > writes and reads payload [0.66ms]
(pass) SharedRingBuffer > returns 0 when full [0.05ms]
(pass) SharedRingBuffer > handles wraparound [0.11ms]

src/tests/ipc/server.test.ts:
(pass) IPCServer > handleData drains ring buffer and emits messages [0.26ms]
[Bun] Ring buffer full!
(pass) IPCServer > send returns false when ring buffer is full [0.07ms]
(pass) IPCServer > start wires READY/DATA and worker state events [12.46ms]

src/tests/sandbox/policy/set.test.ts:
(pass) policy set validation > rejects invalid policy keys [0.12ms]
(pass) policy set validation > accepts empty policy set
(pass) policy set merge > merges defaults and rules [0.23ms]
(pass) policy set metadata > summarizes policies [0.12ms]
---------------------------|---------|---------|-------------------
File                       | % Funcs | % Lines | Uncovered Line #s
---------------------------|---------|---------|-------------------
All files                  |   83.02 |   90.27 |
 src/config.ts             |  100.00 |   95.83 | 
 src/ipc/ffi.ts            |   80.00 |   93.18 | 35-36
 src/ipc/ringbuffer.ts     |  100.00 |  100.00 | 
 src/ipc/server.ts         |   76.47 |   70.62 | 102,172-205,229-232,240-262
 src/proxy.ts              |   75.00 |   94.20 | 112-115,200-201,212-214,260-261
 src/sandbox/policy/set.ts |   66.67 |   87.80 | 33-37,49,61-66,73-74
---------------------------|---------|---------|-------------------

 21 pass
 0 fail
 52 expect() calls
Ran 21 tests across 6 files. [5.12s]
```
