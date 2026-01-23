# Testing Plan for Bun Policy Sandbox

## Overview
This document outlines a comprehensive testing strategy to validate:
1. Integration tests (Bun ↔ Python IPC via Shared Memory Ring Buffer)
2. UI functionality and correctness (Policy management, Template loading)
3. End-to-end Playwright tests (≥60% of scripted UI flows)
4. Policy enforcement (allow/warn/deny behavior)

## Docker Commands Reference

| Command | Purpose | Access Mode |
|----------|-----------|--------------|
| `bun run test:docker:watch` | Runs integration tests in Linux container, then exits | Test execution only |
| `bun run app:docker:watch` | Runs app service via docker-compose, accessible at `http://localhost:3000` | UI testing via browser |

---

## Phase 1: Integration Test Validation

### Goal
Verify existing integration tests correctly validate IPC and policy enforcement.

### Execution
```bash
bun run test:docker:watch
```

### What to Verify

#### 1.1 IPC Integrity
- **File**: `src/index.test.ts`
- **Expectation**: IPCServer starts, connects to Python worker, sends/receives data via ring buffer, stops cleanly
- **Failure Mode**: Timeout if `libshm.so` is missing or ring buffer read/write fails

#### 1.2 Policy Matrix (WebSocket Flow)
- **File**: `src/examples/policy-matrix-comprehensive.ts` + `.spec.json`
- **Flow**:
  1. Connect WebSocket → `ws://localhost:3000`
  2. Wait for `state` message (Python Ready)
  3. Send `apply-policy` → policy applied on Bun side
  4. Send `run` → Python code executed
  5. Capture `output` messages → validate against regex patterns
- **Assertions**:
  - `expect.allow`: All regex patterns present in output
  - `expect.deny`: All regex patterns present in output
  - `expect.warn`: All regex patterns present in output

#### 1.3 Test Coverage Areas
| Domain | Example Script | Policy File | Expected Behavior |
|---------|-----------------|--------------|------------------|
| Filesystem | `fs_allow_tmp.py` | `fs-allowlist.json` | ✅ Allows `/tmp`, ❌ Denies `/etc/hosts` |
| Network | `net_rfc1918_block.py` | `net-egress.json` | ❌ Blocks RFC1918 ranges, ✅ Allows public IPs |
| Exec | `exec_deny_shell.py` | `exec-policy.json` | ✅ Allows `/usr/bin/python3.12`, ❌ Denies `/bin/sh` |

#### 1.4 Success Criteria
- ✅ All test cases in `policy-matrix-comprehensive.spec.json` pass
- ✅ No timeouts or "no output" errors
- ✅ Exit code 0

---

## Phase 2: UI Implementation Review

### Goal
Validate UI against requirements and identify implementation bugs.

### UI Files
- **Main**: `src/public/index.html` (embedded CSS, HTML, JS)
- **Backend**: `src/main.ts` (WebSocket, `/examples` endpoint)

### 2.1 Policy Card Expansion (Requirement)

**Requirement**: All policies should start **collapsed**, and **only one can be open at a time**.

**Current Implementation** (Line 954-957, 986-988):
```javascript
card.dataset.expanded = isDefault ? 'true' : 'false';  // BUG: default starts open
```

**Verification Steps**:
1. Open `http://localhost:3000`
2. Observe policy cards in sidebar
3. **Expected**: All cards collapsed (body hidden)
4. **Expected**: Expanding one card should auto-collapse others
5. **Actual**: First card starts expanded; multiple can be open simultaneously

**Fix Required**:
- Set `data-expanded="false"` for all cards on init
- Modify `toggleCardExpand()` to close all other cards when one opens
- Ensure at most one `.policy-card[data-expanded="true"]` at any time

### 2.2 Template Loading (Requirement)

**Requirement**: Template should load **immediately on selection**, without clicking "Load".

**Current Implementation** (Line 671-676, 1016-1030):
```html
<select id="template-select">
    <option value="" disabled selected>Select Template...</option>
</select>
<button id="load-template" onclick="loadTemplate()">Load</button>
```

**Verification Steps**:
1. Select a template from dropdown
2. **Expected**: Editor content updates immediately
3. **Actual**: Nothing happens until "Load" button clicked

**Fix Required**:
- Add `onchange="loadTemplate()"` to `<select>` element
- Remove or hide the "Load" button (keep it optional)
- Fix duplicate option bug in `loadTemplateIndex()` (Line 997):

```javascript
// BUG FIX
function loadTemplateIndex() {
    const sel = document.getElementById('template-select');
    sel.innerHTML = '';  // CLEAR BEFORE APPENDING
    TEMPLATE_INDEX.forEach((entry) => {
        const opt = document.createElement('option');
        opt.value = entry.id;
        opt.textContent = entry.label;
        sel.appendChild(opt);
    });
}
```

### 2.3 Policy Toggles (Validation)

**Expected Behavior**:
- Toggle ON: Card border color activates, `data-active="true"`, summary count increases
- Toggle OFF: Card border dims, `data-active="false"`, summary count decreases

**Verification Steps**:
1. Toggle default policy OFF → Verify `summary-count` shows "0 Active"
2. Toggle back ON → Verify count returns to "1 Active"
3. Verify visual: border color, glow effect when active

**Known Bug** (Line 987-992):
```javascript
function setPolicyActive(key, enabled) {
    const card = document.querySelector(`.policy-card[data-policy="${key}"]`);
    card.dataset.active = enabled ? 'true' : 'false';
    updatePolicySummary();  // ✅ Called correctly
}
```

**Status**: Logic appears correct, but verify visual state matches `data-active`.

### 2.4 Output Console "Clear" Button

**Verification Steps**:
1. Run code (fills output console)
2. Click "CLEAR" button (top-right of console panel)
3. **Expected**: Console content empties
4. **Actual**: Should work via `clearOutput()` function

---

## Phase 3: Playwright End-to-End Testing

### Goal
Automate UI validation with Playwright, covering **≥60% of scripted UI flows**.

### Setup
```bash
# Terminal 1: Start app for UI testing
bun run app:docker:watch

# Terminal 2: Run Playwright tests
bunx playwright test src/e2e/  # (assuming test files exist)
```

### 3.1 Test Outline (≥60% Coverage)

| ID | Test Case | Steps | Expected Outcome | Selector References |
|-----|------------|--------|-----------------|-------------------|
| **E2E-01** | Connection Status | 1. Navigate to `http://localhost:3000`<br>2. Wait for WebSocket connection<br>3. Verify connection dot changes to green | ✅ Status dot class: `.connected`<br>✅ Text: "Ready" or "Python Connected" | `#conn-dot`, `#conn-text` |
| **E2E-02** | Template Auto-Load | 1. Select "Hello World" from template dropdown<br>2. Verify editor content | ✅ Editor contains expected code<br>✅ No "Load" button click needed | `#template-select` |
| **E2E-03** | Policy Toggle - Single | 1. Toggle "Default" policy OFF<br>2. Verify summary updates<br>3. Verify card visual state | ✅ `summary-count`: "0 Active"<br>✅ Card `data-active="false"`<br>✅ Border dims | `.policy-card[data-policy="default"]`, `#summary-count` |
| **E2E-04** | Policy Toggle - All On | 1. Click "ALL ON" button<br>2. Verify all cards activate | ✅ All cards `data-active="true"`<br>✅ Summary count matches | `button[onclick="enableAllPolicies()"]` |
| **E2E-05** | Policy Toggle - All Off | 1. Click "ALL OFF" button<br>2. Verify all cards deactivate | ✅ All cards `data-active="false"`<br>✅ `summary-count`: "0 Active" | `button[onclick="disableAllPolicies()"]` |
| **E2E-06** | Policy Expansion - Single | 1. Click expand icon on "FSAllowlistPolicy"<br>2. Verify card body appears<br>3. Verify other cards collapse | ✅ Only one card `data-expanded="true"` | `.policy-card[data-policy="FSAllowlistPolicy"]` |
| **E2E-07** | Run Code - Success | 1. Enter `print("Hello")` in editor<br>2. Click "Run Code" button<br>3. Verify console output | ✅ Output appears in console<br>✅ Contains "Hello" | `#editor`, `button[onclick="runCode()"]`, `#output` |
| **E2E-08** | Run Code - Stop | 1. Run long-running code<br>2. Click "Stop" button<br>3. Verify execution halts | ✅ Output stops updating<br>✅ Status shows "Stopped" | `button[onclick="stopCode()"]` |
| **E2E-09** | Apply Policy | 1. Toggle "NetEgressPolicy" ON<br>2. Click "Apply Active Policies"<br>3. Verify policy applied | ✅ Button shows "Applied" feedback<br>✅ State chip shows "Policy Applied" | `#apply-policy` |
| **E2E-10** | Output Console Clear | 1. Run code to fill console<br>2. Click "CLEAR" button<br>3. Verify console empties | ✅ `#output` innerHTML empty | `button[onclick="clearOutput()"]` |
| **E2E-11** | Telemetry - Ring Buffer | 1. Run code repeatedly<br>2. Verify ring buffer stats update | ✅ `b2p-used`, `p2b-used` increase<br>✅ Progress bars reflect usage | `.metric-card` selectors |
| **E2E-12** | Audit Events | 1. Enable "EBPFAuditPolicy" with audit events<br>2. Run code<br>3. Verify audit log populates | ✅ Audit entries appear in list<br>✅ Time, Syscall, Target visible | `#audit-list` |

**Coverage Calculation**:
- Total UI flows identified: ~12 core interactions
- Tests above: 12/12 = **100%** of primary flows
- This exceeds the **60% minimum requirement**

### 3.2 Test Implementation (Example Playwright Code)

```typescript
// src/e2e/ui.spec.ts
import { test, expect } from '@playwright/test';

test.describe('Bun Policy Sandbox UI', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('http://localhost:3000');
    // Wait for connection
    await page.waitForSelector('#conn-dot.connected', { timeout: 5000 });
  });

  test('template auto-loads on selection', async ({ page }) => {
    const templateSelect = page.locator('#template-select');
    const editor = page.locator('#editor');

    await templateSelect.selectOption('hello_world');
    // Verify content loaded without clicking Load button
    await expect(editor).toHaveValue(/Hello World/);
  });

  test('policy cards start collapsed, only one can expand', async ({ page }) => {
    const cards = page.locator('.policy-card');

    // Verify all start collapsed
    for (const card of await cards.all()) {
      await expect(card).toHaveAttribute('data-expanded', 'false');
    }

    // Expand one
    const firstCard = cards.first();
    await firstCard.locator('.expand-icon').click();
    await expect(firstCard).toHaveAttribute('data-expanded', 'true');

    // Verify others collapsed
    const otherCards = cards.nth(1);
    await expect(otherCards).toHaveAttribute('data-expanded', 'false');
  });

  test('run code and verify output', async ({ page }) => {
    const editor = page.locator('#editor');
    const output = page.locator('#output');
    const runButton = page.locator('button[onclick="runCode()"]');

    await editor.fill('print("E2E Test")');
    await runButton.click();

    // Wait for output
    await expect(output).toContainText('E2E Test');
  });

  test('clear console output', async ({ page }) => {
    const editor = page.locator('#editor');
    const output = page.locator('#output');
    const clearButton = page.locator('button[onclick="clearOutput()"]');

    await editor.fill('print("Temp")');
    const runButton = page.locator('button[onclick="runCode()"]');
    await runButton.click();
    await expect(output).toContainText('Temp');

    await clearButton.click();
    await expect(output).toHaveText('');
  });
});
```

---

## Phase 4: Summary of Findings

### 4.1 Expected Test Results

| Phase | Command | Success Criteria |
|--------|----------|-----------------|
| Integration Tests | `bun run test:docker:watch` | ✅ All policies validate allow/warn/deny correctly |
| UI Validation | Manual inspection | ✅ Policies start collapsed, template auto-loads, toggles work |
| Playwright E2E | `bunx playwright test` | ✅ ≥60% of UI flows pass |

### 4.2 Known UI Issues to Fix

1. **Policy Expansion Bug**: Default policy starts expanded; multiple can be open simultaneously
   - **File**: `src/public/index.html:954-957`
   - **Fix**: Initialize `data-expanded="false"`; enforce single-card expand in `toggleCardExpand()`

2. **Template Loader UX**: Requires manual "Load" button click
   - **File**: `src/public/index.html:671-676, 1016-1030`
   - **Fix**: Add `onchange="loadTemplate()"` to select element

3. **Duplicate Template Options**: `loadTemplateIndex()` doesn't clear existing options
   - **File**: `src/public/index.html:997`
   - **Fix**: Add `sel.innerHTML = ''` before appending

4. **Ring Buffer Throughput Bug**: Wrap-around causes negative values
   - **File**: `src/public/index.html:1420` (estimated)
   - **Fix**: Handle ring buffer wrap in delta calculation

### 4.3 Integration Test Gaps

If integration tests fail, check:
- **Linux Environment**: Are we running in Docker with `--privileged`?
- **Shared Library**: Is `libshm.so` compiled and present?
- **Python Worker**: Is `src/worker.py` executable and in correct path?
- **WebSocket**: Is `ws://localhost:3000` reachable from test container?

---

## Execution Sequence

When ready to execute:

1. **Phase 1**: `bun run test:docker:watch` → Capture results
2. **Phase 2**: Manual UI review with `bun run app:docker:watch` → Document findings
3. **Phase 3**: Write Playwright tests → `bunx playwright test`
4. **Phase 4**: Consolidate findings → Identify fixes required

---

## Appendix: File References

| File | Purpose |
|------|----------|
| `src/public/index.html` | UI implementation, policy management, WebSocket client |
| `src/main.ts` | WebSocket server, example catalog, policy apply logic |
| `src/ipc/server.ts` | IPCServer, ring buffer management, Python worker spawn |
| `src/examples/policy-matrix-comprehensive.ts` | Integration test runner |
| `src/examples/policy-matrix-comprehensive.spec.json` | Test case definitions |
| `src/index.test.ts` | Unit test for IPC lifecycle |
| `src/sandbox/policy/set.test.ts` | Unit test for policy parsing |
| `src/worker.py` | Python-side IPC client |
