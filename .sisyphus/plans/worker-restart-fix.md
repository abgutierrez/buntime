# Worker Restart After Policy Denial Fix

## TL;DR

> **Quick Summary**: Fix the debug-ui worker restart issue after policy denial by adding proper cleanup (munmap), worker lifecycle state tracking, and a Supervisor.restartWorker() method that destroys the old IPCServer and creates a fresh one without reloading the main process.
> 
> **Deliverables**:
> - Fixed memory leak (add munmap call in IPCServer.stop())
> - Worker lifecycle state tracking (running/stopped/killed/restarting)
> - Supervisor.restartWorker() method for seamless recovery
> - State events for UI feedback (worker-killed, worker-restarting, worker-restarted)
> - TDD test coverage for all new functionality
> 
> **Estimated Effort**: Medium (4-6 hours)
> **Parallel Execution**: YES - 2 waves
> **Critical Path**: Task 1 (tests) → Task 2 (munmap) → Task 3 (state) → Task 4 (restart) → Task 5 (integration)

---

## Context

### Original Request
Fix the debug-ui worker that cannot be reused after a policy denial kills it. When a user runs code that violates policy (e.g., FS_READ with deny), the worker is killed but cannot be restarted for subsequent executions.

### Interview Summary
**Key Discussions**:
- Auto-restart preferred over explicit restart button
- Supervisor owns restart lifecycle (not IPCServer) to keep Supervisor alive
- sendCode() during restart should reject with error, not queue
- CLI mode keeps current behavior (stop + exit)
- TDD approach requested

**Research Findings**:
- IPCServer.stop() missing munmap() (line 343-358) - confirmed memory leak
- Supervisor.ipcServer reference persists after stop() (line 47, never set to null)
- No state flags in IPCServer (running/stopped not tracked)
- munmap FFI function exported (ffi.ts:54-55) but never called
- worker-bun.ts also missing munmap (line 145)

### Gap Analysis (Self-Review)

**Potential Issues Addressed**:
1. **Restart during restart**: What if user rapidly clicks run? → Tracked via "restarting" state, sendCode rejects
2. **Config preservation**: Policy/config must persist across restart → Supervisor holds these, passes to new IPCServer
3. **Event ordering**: UI needs clear state transitions → Emit killed→restarting→ready sequence
4. **Cleanup order matters**: munmap before close before unlink → Specified in task

**Assumptions Made (validated by research)**:
- bun test infrastructure exists and works (per AGENTS.md)
- IPCServer can be destroyed and recreated without Supervisor restart
- Event listeners on Supervisor persist across IPCServer recreation

---

## Work Objectives

### Core Objective
Enable debug-ui worker to automatically restart after policy denial, with proper resource cleanup and clear state feedback.

### Concrete Deliverables
- `src/ipc/server.ts`: Fixed stop() with munmap, state tracking, kill reason emission
- `src/supervisor/supervisor.ts`: New restartWorker() method, auto-restart on policy kill
- `src/ipc/ffi.ts`: No changes needed (munmap already exported)
- `src/tests/ipc/restart.test.ts`: TDD tests for restart functionality
- `src/tests/ipc/cleanup.test.ts`: TDD tests for proper cleanup

### Definition of Done
- [ ] `bun test src/tests/ipc/restart.test.ts` → PASS
- [ ] `bun test src/tests/ipc/cleanup.test.ts` → PASS
- [ ] Debug-ui: Run code → policy denial → automatic restart → run again → works
- [ ] CLI: Run code → policy denial → exits with non-zero code (unchanged)
- [ ] No memory leaks after repeated restarts (munmap called)

### Must Have
- munmap() call in IPCServer.stop() before close()
- Worker lifecycle state: `running | stopped | killed | restarting`
- Supervisor.restartWorker() method
- Auto-restart on policy denial (debug-ui mode)
- State events: `worker-killed`, `worker-restarting`, `worker-ready`
- sendCode() returns false with error during restart

### Must NOT Have (Guardrails)
- NO changes to CLI exit behavior (keep stop + exit on denial)
- NO queuing of sendCode() during restart (reject only)
- NO main process reload during restart
- NO changes to policy enforcement logic
- NO new dependencies
- NO changes to ring buffer or shared memory protocol
- NO modification of worker.py or worker-bun.ts worker logic (only cleanup)

---

## Verification Strategy

> **UNIVERSAL RULE: ZERO HUMAN INTERVENTION**
>
> ALL tasks in this plan MUST be verifiable WITHOUT any human action.
> Every criterion is verified by running commands or using tools.

### Test Decision
- **Infrastructure exists**: YES (bun test per AGENTS.md)
- **Automated tests**: TDD (tests first)
- **Framework**: bun:test

### TDD Workflow Per Task

**Task Structure:**
1. **RED**: Write failing test first
   - Test file created
   - `bun test [file]` → FAIL (expected - implementation doesn't exist)
2. **GREEN**: Implement minimum code to pass
   - `bun test [file]` → PASS
3. **REFACTOR**: Clean up while keeping green

### Agent-Executed QA Scenarios (MANDATORY)

Every task includes QA scenarios that the executing agent verifies directly.

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Start Immediately):
├── Task 1: Setup test infrastructure for restart tests
└── Task 2: Fix munmap memory leak (independent)

Wave 2 (After Wave 1):
├── Task 3: Add worker lifecycle state tracking
└── Task 4: Implement Supervisor.restartWorker()

Wave 3 (After Wave 2):
└── Task 5: Wire auto-restart on policy denial + integration test

Critical Path: Task 1 → Task 3 → Task 4 → Task 5
Parallel Speedup: ~30% faster than sequential
```

### Dependency Matrix

| Task | Depends On | Blocks | Can Parallelize With |
|------|------------|--------|---------------------|
| 1 | None | 3, 4, 5 | 2 |
| 2 | None | 5 | 1 |
| 3 | 1 | 4, 5 | None |
| 4 | 1, 3 | 5 | None |
| 5 | 2, 3, 4 | None | None (final) |

### Agent Dispatch Summary

| Wave | Tasks | Recommended Agents |
|------|-------|-------------------|
| 1 | 1, 2 | category="quick", parallel |
| 2 | 3, 4 | category="unspecified-low", sequential |
| 3 | 5 | category="unspecified-low" |

---

## TODOs

- [ ] 1. Setup TDD Test Infrastructure for Restart Tests

  **What to do**:
  - Create `src/tests/ipc/restart.test.ts` with test stubs
  - Create `src/tests/ipc/cleanup.test.ts` with test stubs
  - Write failing tests for:
    - `IPCServer.stop() calls munmap`
    - `IPCServer tracks lifecycle state`
    - `Supervisor.restartWorker() creates new IPCServer`
    - `Supervisor auto-restarts on policy kill`
    - `sendCode() rejects during restart`

  **Must NOT do**:
  - Implement actual functionality (tests should fail initially)
  - Modify existing test files

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Creating test file stubs with known patterns
  - **Skills**: `[]`
    - No special skills needed for test file creation
  - **Skills Evaluated but Omitted**:
    - `playwright`: Not UI testing
    - `git-master`: No git operations yet

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Task 2)
  - **Blocks**: Tasks 3, 4, 5
  - **Blocked By**: None

  **References**:

  **Pattern References**:
  - `src/tests/ipc/server.test.ts` - Existing IPC test patterns, mock setup, IPCServer instantiation

  **API/Type References**:
  - `src/ipc/server.ts:IPCServer` - Class under test
  - `src/supervisor/supervisor.ts:Supervisor` - Class under test
  - `src/ipc/protocol.ts:MsgType` - Message types for test assertions

  **Test References**:
  - `src/tests/ipc/server.test.ts` - bun:test patterns (`describe`, `test`, `expect`, `mock`)
  - Example: `mock.module()` usage for mocking dependencies

  **Documentation References**:
  - `AGENTS.md:Testing Patterns` - Test file structure, async helpers

  **WHY Each Reference Matters**:
  - `server.test.ts`: Follow existing test structure, import patterns, mock setup to maintain consistency

  **Acceptance Criteria**:

  **TDD (RED phase):**
  - [ ] Test file created: `src/tests/ipc/restart.test.ts`
  - [ ] Test file created: `src/tests/ipc/cleanup.test.ts`
  - [ ] `bun test src/tests/ipc/restart.test.ts` → FAIL (tests exist, implementations don't)
  - [ ] `bun test src/tests/ipc/cleanup.test.ts` → FAIL

  **Agent-Executed QA Scenarios:**

  ```
  Scenario: Test files created with proper structure
    Tool: Bash
    Preconditions: None
    Steps:
      1. ls -la src/tests/ipc/restart.test.ts
      2. Assert: File exists
      3. ls -la src/tests/ipc/cleanup.test.ts
      4. Assert: File exists
      5. bun test src/tests/ipc/restart.test.ts 2>&1
      6. Assert: Output contains "FAIL" or test failures (RED state)
    Expected Result: Test files exist and fail (no implementation yet)
    Evidence: Command output captured

  Scenario: Tests import correct modules
    Tool: Bash
    Preconditions: Test files created
    Steps:
      1. grep -n "import.*IPCServer" src/tests/ipc/restart.test.ts
      2. Assert: Import statement exists
      3. grep -n "import.*Supervisor" src/tests/ipc/restart.test.ts
      4. Assert: Import statement exists
    Expected Result: Proper imports present
    Evidence: grep output captured
  ```

  **Commit**: YES
  - Message: `test(ipc): add failing tests for worker restart functionality`
  - Files: `src/tests/ipc/restart.test.ts`, `src/tests/ipc/cleanup.test.ts`
  - Pre-commit: `bun test src/tests/ipc/ --dry-run` (verify syntax)

---

- [ ] 2. Fix Memory Leak: Add munmap() to IPCServer.stop()

  **What to do**:
  - Import `munmap` from `./ffi` in `src/ipc/server.ts`
  - Add `munmap(this.shmPtr, this.shmSize)` call in stop() BEFORE close()
  - Ensure cleanup order: munmap → close → shmUnlink
  - Also fix same bug in `src/worker-bun.ts` (import and call munmap)

  **Must NOT do**:
  - Change any other stop() logic
  - Modify shared memory initialization
  - Change cleanup order of other resources (proxy, process, socket)

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Simple 2-line addition to existing method
  - **Skills**: `[]`
    - No special skills needed
  - **Skills Evaluated but Omitted**:
    - `git-master`: Simple change, no complex git needed

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Task 1)
  - **Blocks**: Task 5
  - **Blocked By**: None

  **References**:

  **Pattern References**:
  - `src/ipc/server.ts:343-358` - Current stop() method (missing munmap)
  - `src/ipc/server.ts:46` - Where shmPtr and shmSize are stored

  **API/Type References**:
  - `src/ipc/ffi.ts:54-55` - munmap function signature: `munmap(ptrAddr: number, size: number): number`
  - `src/ipc/ffi.ts:1-10` - Existing imports pattern

  **Test References**:
  - Task 1 creates the tests that will verify this

  **External References**:
  - POSIX munmap: Must unmap before closing fd for clean resource release

  **WHY Each Reference Matters**:
  - `server.ts:343-358`: Exact location to add munmap call, see current cleanup order
  - `ffi.ts:54-55`: Verify munmap signature to call correctly

  **Acceptance Criteria**:

  **TDD (GREEN phase):**
  - [ ] `bun test src/tests/ipc/cleanup.test.ts` → PASS (munmap test passes)

  **Code Changes:**
  - [ ] `src/ipc/server.ts` imports `munmap` from `./ffi`
  - [ ] stop() calls `munmap(this.shmPtr, this.shmSize)` before `close(this.shmFd)`
  - [ ] `src/worker-bun.ts` imports `munmap` from `./ipc/ffi`
  - [ ] worker-bun.ts cleanup calls munmap before close

  **Agent-Executed QA Scenarios:**

  ```
  Scenario: munmap is imported and called in server.ts
    Tool: Bash
    Preconditions: Edit complete
    Steps:
      1. grep -n "import.*munmap.*from.*ffi" src/ipc/server.ts
      2. Assert: Import line exists
      3. grep -n "munmap(" src/ipc/server.ts
      4. Assert: munmap call exists in file
      5. grep -B2 "close(this.shmFd)" src/ipc/server.ts
      6. Assert: munmap appears BEFORE close (correct order)
    Expected Result: munmap imported and called before close
    Evidence: grep output showing line numbers

  Scenario: munmap is imported and called in worker-bun.ts
    Tool: Bash
    Preconditions: Edit complete
    Steps:
      1. grep -n "import.*munmap" src/worker-bun.ts
      2. Assert: Import exists
      3. grep -n "munmap(" src/worker-bun.ts
      4. Assert: munmap call exists
    Expected Result: worker-bun.ts also fixed
    Evidence: grep output

  Scenario: Tests pass after fix
    Tool: Bash
    Preconditions: munmap added
    Steps:
      1. bun test src/tests/ipc/cleanup.test.ts
      2. Assert: Exit code 0
      3. Assert: Output shows all tests passing
    Expected Result: Cleanup tests pass
    Evidence: Test output captured
  ```

  **Commit**: YES
  - Message: `fix(ipc): add munmap call to prevent memory leak on stop`
  - Files: `src/ipc/server.ts`, `src/worker-bun.ts`
  - Pre-commit: `bun test src/tests/ipc/cleanup.test.ts`

---

- [ ] 3. Add Worker Lifecycle State Tracking to IPCServer

  **What to do**:
  - Add `private state: "idle" | "running" | "stopped" | "killed" = "idle"` to IPCServer
  - Add `private killReason: string | null = null` to track why worker was killed
  - Update state transitions:
    - start() → state = "running"
    - stop() → state = "stopped"
    - On policy kill → state = "killed", killReason = "policy-violation"
  - Add getter: `getState(): { state: string, killReason: string | null }`
  - Modify onStateChange callback to include kill reason when applicable
  - Emit "killed" with reason when handleData() calls stop() on policy violation

  **Must NOT do**:
  - Change existing onStateChange signature in breaking way
  - Modify handleData() policy enforcement logic
  - Add state to Supervisor (keep it in IPCServer)

  **Recommended Agent Profile**:
  - **Category**: `unspecified-low`
    - Reason: Moderate complexity, adding state management
  - **Skills**: `[]`
    - Standard TypeScript, no special skills
  - **Skills Evaluated but Omitted**:
    - All skills: This is core TypeScript state machine work

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 2 (sequential after Task 1)
  - **Blocks**: Tasks 4, 5
  - **Blocked By**: Task 1

  **References**:

  **Pattern References**:
  - `src/ipc/server.ts:21-30` - Existing class properties (add state here)
  - `src/ipc/server.ts:256-264` - Where policy denial triggers stop (add killed state here)
  - `src/ipc/server.ts:114-117` - Socket close handler (emit disconnected)

  **API/Type References**:
  - `src/ipc/server.ts:13-15` - Existing callback types (onStateChange signature)
  - `src/supervisor/supervisor.ts:125-137` - How Supervisor consumes onStateChange

  **Test References**:
  - Task 1 creates tests that verify state transitions

  **WHY Each Reference Matters**:
  - `server.ts:21-30`: Add state property alongside existing properties
  - `server.ts:256-264`: This is the policy denial handler where we set killed state
  - `supervisor.ts:125-137`: Ensure state change callback signature remains compatible

  **Acceptance Criteria**:

  **TDD (GREEN phase):**
  - [ ] `bun test src/tests/ipc/restart.test.ts -t "state"` → PASS (state tests pass)

  **Code Changes:**
  - [ ] `state` property exists on IPCServer
  - [ ] `killReason` property exists on IPCServer
  - [ ] `getState()` method returns current state and killReason
  - [ ] Policy denial in handleData() sets state="killed", killReason="policy-violation"
  - [ ] onStateChange callback receives kill info

  **Agent-Executed QA Scenarios:**

  ```
  Scenario: State property and getter exist
    Tool: Bash
    Preconditions: Implementation complete
    Steps:
      1. grep -n "private state:" src/ipc/server.ts
      2. Assert: Property declaration exists
      3. grep -n "getState()" src/ipc/server.ts
      4. Assert: Getter method exists
      5. grep -n "killReason" src/ipc/server.ts
      6. Assert: killReason property exists
    Expected Result: State tracking infrastructure added
    Evidence: grep output with line numbers

  Scenario: Policy denial sets killed state
    Tool: Bash
    Preconditions: Implementation complete
    Steps:
      1. grep -A5 "Optimistic Violation" src/ipc/server.ts
      2. Assert: "killed" state assignment appears near stop() call
      3. Assert: killReason assignment appears
    Expected Result: Policy denial triggers killed state
    Evidence: grep output showing state assignment

  Scenario: State tests pass
    Tool: Bash
    Preconditions: Implementation complete
    Steps:
      1. bun test src/tests/ipc/restart.test.ts -t "state"
      2. Assert: Exit code 0
    Expected Result: All state-related tests pass
    Evidence: Test output
  ```

  **Commit**: YES
  - Message: `feat(ipc): add worker lifecycle state tracking`
  - Files: `src/ipc/server.ts`
  - Pre-commit: `bun test src/tests/ipc/restart.test.ts -t "state"`

---

- [ ] 4. Implement Supervisor.restartWorker() Method

  **What to do**:
  - Add `private isRestarting: boolean = false` to Supervisor
  - Add `async restartWorker(): Promise<void>` method:
    1. Set `isRestarting = true`
    2. Emit `{ type: "state", data: { worker: "restarting" } }`
    3. Call `this.ipcServer.stop()`
    4. Set `this.ipcServer = null`
    5. Create new IPCServer (same pattern as start())
    6. Register callbacks (same as start())
    7. Call `await this.ipcServer.start(...)` with same config
    8. Wait for READY signal
    9. Set `isRestarting = false`
    10. Emit `{ type: "state", data: { worker: "ready", signal: "RESTARTED" } }`
  - Modify `sendCode()` to check `isRestarting`:
    ```typescript
    if (this.isRestarting) {
      this.emit({ type: "error", data: "Worker is restarting, please wait" });
      return false;
    }
    ```

  **Must NOT do**:
  - Change start() method signature
  - Modify CLI behavior
  - Add auto-restart trigger (that's Task 5)
  - Queue sendCode() calls

  **Recommended Agent Profile**:
  - **Category**: `unspecified-low`
    - Reason: Moderate async logic, follows existing patterns
  - **Skills**: `[]`
    - Standard TypeScript async/await
  - **Skills Evaluated but Omitted**:
    - All skills: Core TypeScript async work

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 2 (after Task 3)
  - **Blocks**: Task 5
  - **Blocked By**: Tasks 1, 3

  **References**:

  **Pattern References**:
  - `src/supervisor/supervisor.ts:93-152` - start() method (copy IPCServer creation pattern)
  - `src/supervisor/supervisor.ts:116-143` - Exact lines for IPCServer setup and callbacks
  - `src/supervisor/supervisor.ts:176-184` - stop() method (reference for cleanup)

  **API/Type References**:
  - `src/supervisor/supervisor.ts:47` - ipcServer property declaration
  - `src/supervisor/supervisor.ts:68-79` - Config properties to preserve
  - `src/ipc/server.ts:IPCServer` - Constructor signature

  **Test References**:
  - Task 1 creates tests for restartWorker()

  **WHY Each Reference Matters**:
  - `supervisor.ts:116-143`: CRITICAL - exact pattern for creating IPCServer with callbacks
  - `supervisor.ts:93-152`: See full start() flow to replicate relevant parts

  **Acceptance Criteria**:

  **TDD (GREEN phase):**
  - [ ] `bun test src/tests/ipc/restart.test.ts -t "restartWorker"` → PASS

  **Code Changes:**
  - [ ] `isRestarting` property exists on Supervisor
  - [ ] `restartWorker()` method exists and is async
  - [ ] Method emits "restarting" state
  - [ ] Method destroys old IPCServer and creates new one
  - [ ] Method emits "ready" with "RESTARTED" signal
  - [ ] sendCode() rejects during restart with appropriate error

  **Agent-Executed QA Scenarios:**

  ```
  Scenario: restartWorker method exists with correct signature
    Tool: Bash
    Preconditions: Implementation complete
    Steps:
      1. grep -n "async restartWorker" src/supervisor/supervisor.ts
      2. Assert: Method declaration exists
      3. grep -n "isRestarting" src/supervisor/supervisor.ts
      4. Assert: Property exists
    Expected Result: Method and flag exist
    Evidence: grep output

  Scenario: sendCode rejects during restart
    Tool: Bash
    Preconditions: Implementation complete
    Steps:
      1. grep -A3 "if.*isRestarting" src/supervisor/supervisor.ts
      2. Assert: Check exists in sendCode
      3. Assert: Returns false or emits error
    Expected Result: sendCode guards against restart state
    Evidence: grep output

  Scenario: Restart tests pass
    Tool: Bash
    Preconditions: Implementation complete
    Steps:
      1. bun test src/tests/ipc/restart.test.ts -t "restartWorker"
      2. Assert: Exit code 0
    Expected Result: All restartWorker tests pass
    Evidence: Test output
  ```

  **Commit**: YES
  - Message: `feat(supervisor): add restartWorker method for worker recovery`
  - Files: `src/supervisor/supervisor.ts`
  - Pre-commit: `bun test src/tests/ipc/restart.test.ts -t "restartWorker"`

---

- [ ] 5. Wire Auto-Restart on Policy Denial + Integration Test

  **What to do**:
  - In Supervisor's onStateChange callback, detect policy kill and trigger restart:
    ```typescript
    this.ipcServer.setOnStateChange((state, signal, data) => {
      // ... existing logic ...
      if (state === "killed" && data?.reason === "policy-violation") {
        // Auto-restart in debug-ui mode (not CLI)
        this.restartWorker().catch(err => {
          this.emit({ type: "error", data: `Restart failed: ${err.message}` });
        });
      }
      // ... existing emit ...
    });
    ```
  - Ensure CLI mode doesn't auto-restart (check: CLI calls stop() after execution ends)
  - Add integration test that:
    1. Creates Supervisor with deny policy
    2. Sends code that triggers FS_READ
    3. Verifies worker-killed event
    4. Verifies worker-restarting event
    5. Verifies worker-ready event
    6. Sends new code successfully

  **Must NOT do**:
  - Modify CLI.ts behavior
  - Change policy enforcement logic
  - Add restart for non-policy kills (crashes, etc.)

  **Recommended Agent Profile**:
  - **Category**: `unspecified-low`
    - Reason: Wiring existing pieces together, integration test
  - **Skills**: `[]`
    - Standard TypeScript
  - **Skills Evaluated but Omitted**:
    - All skills: Integration work using existing components

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 3 (final)
  - **Blocks**: None (final task)
  - **Blocked By**: Tasks 2, 3, 4

  **References**:

  **Pattern References**:
  - `src/supervisor/supervisor.ts:125-137` - onStateChange callback (add auto-restart here)
  - `src/ipc/server.ts:256-264` - Where killed state is set (verify data shape)

  **API/Type References**:
  - Task 3 defines the state/data shape for killed state
  - Task 4 defines restartWorker() signature

  **Test References**:
  - `src/tests/ipc/server.test.ts` - Pattern for integration tests with Supervisor

  **WHY Each Reference Matters**:
  - `supervisor.ts:125-137`: EXACT location to add auto-restart trigger
  - Task 3/4: Depend on their implementations for state shape and method

  **Acceptance Criteria**:

  **TDD (GREEN phase):**
  - [ ] `bun test src/tests/ipc/restart.test.ts` → ALL PASS
  - [ ] `bun test src/tests/ipc/cleanup.test.ts` → ALL PASS

  **Integration Verification:**
  - [ ] Integration test simulates policy denial → restart → recovery
  - [ ] CLI mode unchanged (verify by code inspection, not behavior change)

  **Agent-Executed QA Scenarios:**

  ```
  Scenario: Auto-restart wired in onStateChange
    Tool: Bash
    Preconditions: Implementation complete
    Steps:
      1. grep -A10 "setOnStateChange" src/supervisor/supervisor.ts | head -20
      2. Assert: Contains check for "killed" state
      3. Assert: Contains call to restartWorker
    Expected Result: Auto-restart trigger exists
    Evidence: grep output

  Scenario: All tests pass (full suite)
    Tool: Bash
    Preconditions: All implementations complete
    Steps:
      1. bun test src/tests/ipc/restart.test.ts
      2. Assert: Exit code 0, all tests pass
      3. bun test src/tests/ipc/cleanup.test.ts
      4. Assert: Exit code 0, all tests pass
    Expected Result: Complete test suite passes
    Evidence: Test output for both files

  Scenario: CLI behavior unchanged (code inspection)
    Tool: Bash
    Preconditions: Implementation complete
    Steps:
      1. grep -n "supervisor.stop()" src/cli.ts
      2. Assert: CLI still calls stop() (not restart)
      3. grep -n "process.exit" src/cli.ts
      4. Assert: CLI still exits after completion
    Expected Result: CLI unchanged
    Evidence: grep output confirming CLI calls stop+exit
  ```

  **Commit**: YES
  - Message: `feat(supervisor): auto-restart worker on policy denial`
  - Files: `src/supervisor/supervisor.ts`, `src/tests/ipc/restart.test.ts`
  - Pre-commit: `bun test src/tests/ipc/`

---

## Commit Strategy

| After Task | Message | Files | Verification |
|------------|---------|-------|--------------|
| 1 | `test(ipc): add failing tests for worker restart functionality` | restart.test.ts, cleanup.test.ts | bun test --dry-run |
| 2 | `fix(ipc): add munmap call to prevent memory leak on stop` | server.ts, worker-bun.ts | bun test cleanup.test.ts |
| 3 | `feat(ipc): add worker lifecycle state tracking` | server.ts | bun test -t "state" |
| 4 | `feat(supervisor): add restartWorker method for worker recovery` | supervisor.ts | bun test -t "restartWorker" |
| 5 | `feat(supervisor): auto-restart worker on policy denial` | supervisor.ts, restart.test.ts | bun test src/tests/ipc/ |

---

## Success Criteria

### Verification Commands
```bash
# All tests pass
bun test src/tests/ipc/restart.test.ts     # Expected: PASS
bun test src/tests/ipc/cleanup.test.ts     # Expected: PASS

# Type check
bunx tsc --noEmit                           # Expected: no errors

# Lint (if configured)
bun run lint                                # Expected: no errors
```

### Final Checklist
- [ ] All "Must Have" present
- [ ] All "Must NOT Have" absent
- [ ] All TDD tests pass
- [ ] munmap() called in stop() (memory leak fixed)
- [ ] Worker lifecycle state tracked
- [ ] Supervisor.restartWorker() works
- [ ] Auto-restart on policy denial (debug-ui mode)
- [ ] CLI behavior unchanged
- [ ] No breaking changes to existing APIs
