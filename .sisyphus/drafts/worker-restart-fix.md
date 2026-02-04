# Draft: Worker Restart After Policy Denial Fix

## Requirements (confirmed)
- Clean execution should continue working (worker remains usable)
- Policy violation should allow recovery (restart after deny+kill)
- Debug UI should show clear state (dead vs alive)
- Minimal changes (no major architectural changes)
- No breaking changes (CLI must continue working)

## Problem Summary
The debug-ui worker cannot be reused after a policy denial kills it. The `stop()` method destroys resources but leaves stale references, causing subsequent `sendCode()` calls to fail.

## Root Causes Identified
1. No restart mechanism in Supervisor
2. IPCServer destroyed but reference persists (not set to null)
3. Shared memory/sockets destroyed, cannot be reused
4. Stale process handles (processHandle, sandboxPid not reset)
5. Missing munmap call (memory leak)
6. No explicit "killed" state to distinguish policy kill from crash

## Key Files
- `src/ipc/server.ts` - IPCServer with stop() and handleData()
- `src/supervisor/supervisor.ts` - Supervisor class (no restart logic)
- `src/ipc/ffi.ts` - FFI bindings (munmap exported but never called)
- `example/debug-ui/server.ts` - Debug UI WebSocket server

## Research Findings

### IPCServer Analysis (src/ipc/server.ts)
- **stop() method (lines 343-358)**: Kills processes, stops proxy, closes fd, unlinks shm
- **Missing munmap()**: Memory leak - mmap() called in constructor but munmap() never called in stop()
- **No state flags**: No `running`/`stopped` boolean to track lifecycle
- **handleData() denial (lines 256-264)**: On FS_READ/LISTDIR policy violation, calls `this.stop()` killing worker with no restart

### Supervisor Analysis (src/supervisor/supervisor.ts)  
- **ipcServer property (line 47)**: `private ipcServer: IPCServer | null = null`
- **Creation (lines 116-123)**: New IPCServer created in start(), stored as class property
- **sendCode() (lines 154-170)**: Checks `if (!this.ipcServer)` but reference persists after stop()
- **stop() (lines 176-184)**: Calls `ipcServer?.stop()` but doesn't set `this.ipcServer = null`
- **NO RESTART MECHANISM**: Worker killed on denial, ipcServer remains non-null, subsequent sendCode() fails

### FFI Analysis (src/ipc/ffi.ts)
- **munmap exported**: `export function munmap(ptrAddr: number, size: number): number`
- **NEVER CALLED**: grep confirms munmap is defined but not used anywhere
- **Proper cleanup order**: Should be munmap → close → shmUnlink (currently missing munmap)
- **Same bug in worker-bun.ts**: Also missing munmap call

### CLI vs Debug-UI Usage Patterns
| Aspect | CLI Mode | Debug-UI Mode |
|--------|----------|---------------|
| Duration | Single execution, then exits | Indefinite, multiple executions |
| Event Listener | Only `output` and `error` | ALL events via `onEvent()` |
| Code Sending | Once, then stops | Multiple times via WebSocket |
| Termination | `supervisor.stop()` after completion | `supervisor.interrupt()` or explicit |
| Restart Need | Not needed (exits anyway) | **CRITICAL** (user wants to run again) |

### Current Failure Flow
1. User runs code with deny policy in debug-ui
2. Worker attempts FS_READ (optimistic operation)
3. Supervisor denies → IPCServer.handleData() calls `this.stop()` (line 261)
4. stop() destroys everything BUT keeps stale references
5. User tries to run again via WebSocket
6. supervisor.sendCode() thinks ipcServer exists (reference not null)
7. sendOp() fails - shared memory is gone, worker is dead

## Open Questions
1. Auto-restart vs explicit restart after policy kill?
2. IPCServer.restart() vs Supervisor handles restart?
3. Transition period handling between old worker death and new worker ready?
4. Worker timeout after clean execution?
5. State preservation across worker restarts (policies, config)?

## Scope Boundaries
- INCLUDE: IPCServer stop/cleanup, Supervisor restart logic, state tracking, munmap
- EXCLUDE: Major architectural changes, new features beyond restart

## Technical Decisions (confirmed)

### 1. Restart Behavior: Auto-restart
- Worker restarts automatically after policy denial
- User sees "restarting..." state, then can run again
- Seamless UX for debug-ui mode

### 2. Restart Responsibility: Supervisor.restartWorker()
- Supervisor owns the lifecycle (not IPCServer)
- Creates new IPCServer instance, preserves config/policy
- Critical requirement: Supervisor stays alive, no main process reload
- This means we need to cleanly destroy old IPCServer and create fresh one

### 3. Transition Handling: Reject with error
- sendCode() returns false, emits "error: Worker restarting"
- Simple, predictable behavior
- UI can show "please wait" message

### 4. CLI Behavior: Keep current (stop + exit)
- Single-execution pattern unchanged
- Policy denial = failure = exit with non-zero code
- Makes sense for scripts and automation

### Architecture Implication
Since restart is at Supervisor level but IPCServer must be replaceable:
- IPCServer.stop() must cleanly release ALL resources (including munmap)
- Supervisor needs new `restartWorker()` method that:
  1. Calls old ipcServer.stop()
  2. Sets this.ipcServer = null
  3. Creates new IPCServer with same config
  4. Awaits READY signal
  5. Emits "worker-restarted" event
- IPCServer needs to emit "killed" reason so Supervisor knows to auto-restart
