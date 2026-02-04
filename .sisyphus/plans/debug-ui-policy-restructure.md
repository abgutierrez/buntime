# Debug-UI Policy Restructure

## TL;DR

> **Quick Summary**: Restructure the debug-ui policy selector to auto-configure policies when example scripts are selected, simplify policy cards to single-domain focus, and add production-ready composite policies.
> 
> **Deliverables**:
> - Updated `exampleCatalog.ts` with `recommendedPolicies` field per example
> - Restructured `POLICIES` object with single-domain policies + composites
> - Simplified `getPolicyBodyHTML()` with domain-aware rendering
> - Auto-enable logic in `loadTemplate()` 
> - Removed legacy schema support (~100 lines)
> - 1-2 composite policies (LambdaBackendPolicy)
> 
> **Estimated Effort**: Medium (3-4 hours)
> **Parallel Execution**: YES - 2 waves
> **Critical Path**: Task 1 → Task 2 → Task 4 → Task 6

---

## Context

### Original Request
Restructure the debug-ui policy selector to:
- Auto-configure policies when selecting an example script
- Simplify policy cards by removing unnecessary inputs
- Show isolated use-cases more clearly

### Interview Summary
**Key Discussions**:
- **Example→Policy linking**: Auto-enable relevant policy when example selected (replace, not append)
- **Card content**: Toggle + English summary + allow/deny rule inputs only
- **Policy structure**: Single-domain for basic policies (FS/NET/EXEC separate), composite for production
- **Mapping location**: Add `recommendedPolicies` field to exampleCatalog.ts entries
- **Composite policies**: Add real-world template like "Lambda Backend" now
- **Legacy schema**: Remove support (filesystem, network, commands, execution fields)
- **Test strategy**: Playwright verification only

### Metis Review
**Identified Gaps** (addressed):
- **Merging Behavior**: UI sends partial policy objects; resolved by making single-domain policies only include their domain's config
- **Auto-Configuration Override**: REPLACE (reset + select recommended) to ensure example runs in intended environment
- **collectKernelPolicy fix**: Must only collect defaults for domains the policy actually defines
- **Domain metadata**: Add `domains: string[]` to POLICIES entries for dynamic rendering

---

## Work Objectives

### Core Objective
Enable example→policy auto-configuration and simplify the policy UI to show single-domain focus with clear separation of concerns.

### Concrete Deliverables
- `example/debug-ui/exampleCatalog.ts` with `recommendedPolicies: string[]` field
- Restructured `POLICIES` object in `index.html` with `domains` metadata
- Simplified `getPolicyBodyHTML()` (~60% smaller, no legacy branch)
- New `applyRecommendedPolicies()` function
- Updated `loadTemplate()` to call policy auto-config
- `LambdaBackendPolicy` composite policy
- Removed `collectLegacyPolicy()` and legacy rendering code

### Definition of Done
- [ ] Selecting "FS Allow /tmp" example auto-enables FSAllowlistPolicy only
- [ ] Policy cards only show inputs relevant to their domain
- [ ] Legacy schema code removed from index.html
- [ ] LambdaBackendPolicy exists and shows both FS and NET controls
- [ ] All 17 examples have `recommendedPolicies` mapping

### Must Have
- Single-domain policy separation (FS policy shows only FS controls)
- Example→policy auto-enable on template selection
- Domain-aware card rendering (no NET controls in FS-only policy)
- At least one composite policy for production use-case

### Must NOT Have (Guardrails)
- No changes to backend policy enforcement (supervisor, sandbox)
- No changes to WebSocket message format
- No new policy JSON files in `src/policies/`
- No unit tests for inline JavaScript (Playwright only)
- No CSS overhaul (minimal style changes only)
- No removal of existing 5 policies (only restructure)

---

## Verification Strategy

> **UNIVERSAL RULE: ZERO HUMAN INTERVENTION**
> ALL verification executed by agent using Playwright/Bash.

### Test Decision
- **Infrastructure exists**: NO (no test framework for index.html JS)
- **Automated tests**: Playwright verification
- **Framework**: Playwright via skill

### Agent-Executed QA Scenarios (MANDATORY)

All scenarios run against `http://localhost:3000` with debug-ui server running.

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Start Immediately):
├── Task 1: Update exampleCatalog.ts with recommendedPolicies
└── Task 3: Restructure POLICIES object (add domains, single-domain focus)

Wave 2 (After Wave 1):
├── Task 2: Implement applyRecommendedPolicies() and update loadTemplate()
├── Task 4: Simplify getPolicyBodyHTML() with domain-aware rendering
└── Task 5: Remove legacy schema code

Wave 3 (After Wave 2):
└── Task 6: Playwright verification
```

### Dependency Matrix

| Task | Depends On | Blocks | Can Parallelize With |
|------|------------|--------|---------------------|
| 1 | None | 2 | 3 |
| 3 | None | 4 | 1 |
| 2 | 1 | 6 | 4, 5 |
| 4 | 3 | 6 | 2, 5 |
| 5 | None | 6 | 2, 4 |
| 6 | 2, 4, 5 | None | None (final) |

### Agent Dispatch Summary

| Wave | Tasks | Recommended Agents |
|------|-------|-------------------|
| 1 | 1, 3 | category="visual-engineering", load_skills=["frontend-ui-ux"] |
| 2 | 2, 4, 5 | category="visual-engineering", load_skills=["frontend-ui-ux"] |
| 3 | 6 | category="quick", load_skills=["playwright"] |

---

## TODOs

- [x] 1. Add recommendedPolicies to exampleCatalog.ts

  **What to do**:
  - Add `recommendedPolicies: string[]` field to each example entry
  - Map examples to their recommended policies:
    - `hello_world` → `[]` (no policies needed)
    - `fs_allow_tmp`, `fs_allow_etc`, `fs_deny_*` → `["FSAllowlistPolicy"]`
    - `net_*` → `["NetEgressPolicy"]`
    - `exec_*` → `["ExecPolicy"]`
  - Export type interface for TypeScript validation

  **Must NOT do**:
  - Don't modify the file structure or group names
  - Don't add policy definitions here (only references)

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Simple data structure addition, single file, clear mapping
  - **Skills**: [`frontend-ui-ux`]
    - `frontend-ui-ux`: TypeScript interface update
  - **Skills Evaluated but Omitted**:
    - `playwright`: Not needed for data-only change

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Task 3)
  - **Blocks**: Task 2
  - **Blocked By**: None

  **References**:
  - `example/debug-ui/exampleCatalog.ts:1-122` - Current catalog structure, add field to each entry
  - `example/debug-ui/index.html:1070-1107` - loadTemplateIndex() consumes this data

  **Acceptance Criteria**:
  - [ ] Each of 17 entries has `recommendedPolicies: string[]` field
  - [ ] TypeScript compiles without errors: `bunx tsc --noEmit example/debug-ui/exampleCatalog.ts` → no errors
  - [ ] Field values match mapping table above

  **Agent-Executed QA Scenarios**:
  ```
  Scenario: exampleCatalog has recommendedPolicies field
    Tool: Bash (grep)
    Preconditions: None
    Steps:
      1. grep -c "recommendedPolicies" example/debug-ui/exampleCatalog.ts
      2. Assert: output >= 17 (one per entry)
    Expected Result: All entries have the field
    Evidence: grep output count
  ```

  **Commit**: YES
  - Message: `feat(debug-ui): add recommendedPolicies mapping to exampleCatalog`
  - Files: `example/debug-ui/exampleCatalog.ts`

---

- [x] 2. Implement applyRecommendedPolicies() and update loadTemplate()

  **What to do**:
  - Add new function `applyRecommendedPolicies(policyKeys: string[])`:
    - Disable all policy cards first (reset)
    - Enable only the policies in policyKeys array
    - Update summary display
  - Modify `loadTemplate()` to:
    - Find the selected example's entry from TEMPLATE_INDEX
    - Call `applyRecommendedPolicies(entry.recommendedPolicies)`
  - Ensure the mapping from exampleCatalog.ts flows through `/examples` endpoint

  **Must NOT do**:
  - Don't modify server.ts (it already returns the full catalog)
  - Don't change the WebSocket message format
  - Don't auto-run code (only configure policies)

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
    - Reason: UI logic with DOM manipulation
  - **Skills**: [`frontend-ui-ux`]
    - `frontend-ui-ux`: JavaScript DOM manipulation, event handling

  **Parallelization**:
  - **Can Run In Parallel**: YES (after Task 1)
  - **Parallel Group**: Wave 2 (with Tasks 4, 5)
  - **Blocks**: Task 6
  - **Blocked By**: Task 1

  **References**:
  - `example/debug-ui/index.html:1109-1127` - Current loadTemplate() function
  - `example/debug-ui/index.html:1677-1697` - enableAllPolicies/disableAllPolicies patterns
  - `example/debug-ui/index.html:1060-1065` - setPolicyActive() function
  - `example/debug-ui/server.ts:38-56` - /examples endpoint returns full catalog

  **Acceptance Criteria**:
  - [ ] `applyRecommendedPolicies` function exists and is callable
  - [ ] Selecting "FS Allow /tmp" enables FSAllowlistPolicy only
  - [ ] Selecting "Hello World" disables all policies
  - [ ] Policy summary updates after selection

  **Agent-Executed QA Scenarios**:
  ```
  Scenario: FS example enables FSAllowlistPolicy
    Tool: Playwright (playwright skill)
    Preconditions: Debug-ui server running on localhost:3000
    Steps:
      1. Navigate to: http://localhost:3000
      2. Wait for: #template-select visible (timeout: 5s)
      3. Select option with value "fs_allow_tmp" in #template-select
      4. Wait for: 500ms (allow JS to execute)
      5. Assert: .policy-card[data-policy="FSAllowlistPolicy"][data-active="true"] exists
      6. Assert: .policy-card[data-policy="NetEgressPolicy"][data-active="false"] exists
      7. Assert: .policy-card[data-policy="ExecPolicy"][data-active="false"] exists
      8. Screenshot: .sisyphus/evidence/task-2-fs-example-policy.png
    Expected Result: Only FSAllowlistPolicy is active
    Evidence: .sisyphus/evidence/task-2-fs-example-policy.png

  Scenario: Hello World disables all policies
    Tool: Playwright (playwright skill)
    Preconditions: Debug-ui server running
    Steps:
      1. Navigate to: http://localhost:3000
      2. Select option "hello_world" in #template-select
      3. Wait for: 500ms
      4. Assert: .policy-card[data-active="true"] count is 0
      5. Assert: #summary-count text contains "0 Active"
    Expected Result: No policies active
    Evidence: Screenshot captured
  ```

  **Commit**: YES (groups with Task 4)
  - Message: `feat(debug-ui): auto-configure policies on example selection`
  - Files: `example/debug-ui/index.html`

---

- [x] 3. Restructure POLICIES object with domains metadata

  **What to do**:
  - Add `domains: string[]` metadata to each policy in POLICIES object:
    - `FSAllowlistPolicy`: `domains: ["fs"]`
    - `NetEgressPolicy`: `domains: ["net"]`
    - `ExecPolicy`: `domains: ["exec"]`
    - `AntiEscapePolicy`: `domains: ["antiEscape"]`
    - `EBPFAuditPolicy`: `domains: ["audit"]`
  - Remove cross-domain defaults from single-domain policies:
    - FSAllowlistPolicy should only have `defaults: { fs: "deny" }` (not net/exec)
    - NetEgressPolicy should only have `defaults: { net: "allow" }` (net rules define behavior)
    - etc.
  - Add `LambdaBackendPolicy` composite policy:
    - `domains: ["fs", "net", "exec"]`
    - `defaults: { fs: "deny", net: "allow", exec: "deny" }`
    - FS rules: allow /tmp (r/w), allow /var/task (read)
    - NET rules: deny RFC1918, allow public
    - EXEC rules: allow python only

  **Must NOT do**:
  - Don't remove any existing policy (only restructure)
  - Don't change policy names (keys are referenced elsewhere)
  - Don't modify the rule arrays themselves

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Data restructure in single object
  - **Skills**: [`frontend-ui-ux`]
    - `frontend-ui-ux`: JSON/JS object manipulation

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Task 1)
  - **Blocks**: Task 4
  - **Blocked By**: None

  **References**:
  - `example/debug-ui/index.html:924-997` - Current POLICIES object
  - `src/policies/fs-allowlist.json` - Reference for FS-only policy structure
  - `src/policies/net-egress.json` - Reference for NET-only policy structure
  - `src/policies/exec-policy.json` - Reference for EXEC-only policy structure

  **Acceptance Criteria**:
  - [ ] Each policy has `domains: string[]` field
  - [ ] Single-domain policies only have their domain in `defaults`
  - [ ] `LambdaBackendPolicy` exists with domains ["fs", "net", "exec"]
  - [ ] Total of 6 policies in POLICIES object

  **Agent-Executed QA Scenarios**:
  ```
  Scenario: POLICIES has domains metadata
    Tool: Bash (grep)
    Preconditions: None
    Steps:
      1. grep -c '"domains":' example/debug-ui/index.html
      2. Assert: output >= 6
    Expected Result: All policies have domains field
    Evidence: grep count

  Scenario: LambdaBackendPolicy exists
    Tool: Bash (grep)
    Preconditions: None
    Steps:
      1. grep "LambdaBackendPolicy" example/debug-ui/index.html
      2. Assert: output contains "LambdaBackendPolicy"
    Expected Result: Composite policy defined
    Evidence: grep output
  ```

  **Commit**: YES (groups with Task 4)
  - Message: `feat(debug-ui): add domains metadata and LambdaBackendPolicy`
  - Files: `example/debug-ui/index.html`

---

- [x] 4. Simplify getPolicyBodyHTML() with domain-aware rendering

  **What to do**:
  - Rewrite `getPolicyBodyHTML(key, p)` to be domain-driven:
    - Check `p.domains` array to determine which sections to render
    - Only render controls for domains the policy defines
    - Remove the `if (p.version)` vs legacy branch (legacy removed in Task 5)
  - Remove "Kernel Plugins" section (namespaces/landlock/seccomp toggles)
  - Keep "Default Actions" section but only for domains in `p.domains`
  - Keep rule display sections (FS/NET/EXEC rules) but only for relevant domains
  - Add English summary at top of expanded card body

  **Must NOT do**:
  - Don't remove the rule editing capability entirely (keep allow/deny inputs)
  - Don't change CSS classes (existing styles must work)
  - Don't modify collectKernelPolicy yet (separate concern)

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
    - Reason: Complex HTML generation refactor
  - **Skills**: [`frontend-ui-ux`]
    - `frontend-ui-ux`: HTML template generation, conditional rendering

  **Parallelization**:
  - **Can Run In Parallel**: YES (after Task 3)
  - **Parallel Group**: Wave 2 (with Tasks 2, 5)
  - **Blocks**: Task 6
  - **Blocked By**: Task 3

  **References**:
  - `example/debug-ui/index.html:1206-1335` - Current getPolicyBodyHTML function
  - `example/debug-ui/index.html:1376-1406` - collectKernelPolicy (will need update to match)

  **Acceptance Criteria**:
  - [ ] FSAllowlistPolicy card does NOT show NET or EXEC controls
  - [ ] NetEgressPolicy card does NOT show FS or EXEC controls
  - [ ] LambdaBackendPolicy card shows FS, NET, and EXEC controls
  - [ ] "Kernel Plugins" section removed from all cards
  - [ ] Code is ~40% shorter than original

  **Agent-Executed QA Scenarios**:
  ```
  Scenario: FS-only policy shows only FS controls
    Tool: Playwright (playwright skill)
    Preconditions: Debug-ui server running on localhost:3000
    Steps:
      1. Navigate to: http://localhost:3000
      2. Click: .policy-card[data-policy="FSAllowlistPolicy"] .policy-card__header
      3. Wait for: .policy-card[data-policy="FSAllowlistPolicy"][data-expanded="true"] (timeout: 2s)
      4. Assert: .policy-card[data-policy="FSAllowlistPolicy"] [data-section="defaults"][data-key="fs"] exists
      5. Assert: .policy-card[data-policy="FSAllowlistPolicy"] [data-section="defaults"][data-key="net"] does NOT exist
      6. Assert: .policy-card[data-policy="FSAllowlistPolicy"] [data-section="plugins"] does NOT exist
      7. Screenshot: .sisyphus/evidence/task-4-fs-card-expanded.png
    Expected Result: Only FS controls visible
    Evidence: .sisyphus/evidence/task-4-fs-card-expanded.png

  Scenario: Composite policy shows multiple domain controls
    Tool: Playwright (playwright skill)
    Preconditions: Debug-ui server running
    Steps:
      1. Navigate to: http://localhost:3000
      2. Click: .policy-card[data-policy="LambdaBackendPolicy"] .policy-card__header
      3. Wait for: [data-expanded="true"] (timeout: 2s)
      4. Assert: [data-section="defaults"][data-key="fs"] exists in LambdaBackendPolicy card
      5. Assert: [data-section="defaults"][data-key="net"] exists in LambdaBackendPolicy card
      6. Assert: [data-section="defaults"][data-key="exec"] exists in LambdaBackendPolicy card
    Expected Result: All three domain controls visible
    Evidence: Screenshot captured
  ```

  **Commit**: YES (combined with Tasks 2, 3)
  - Message: `feat(debug-ui): domain-aware policy card rendering`
  - Files: `example/debug-ui/index.html`

---

- [x] 5. Remove legacy schema code

  **What to do**:
  - Remove the `else` branch in `getPolicyBodyHTML` (lines ~1285-1332)
  - Remove `collectLegacyPolicy` function (lines ~1408-1439)
  - Update `collectPolicies` to only call `collectKernelPolicy`
  - Update `collectKernelPolicy` to only collect defaults for domains defined in the policy:
    - Read `POLICIES[key].domains` to know which defaults to include
    - Don't default missing domains to 'deny' (causes implicit blocking)

  **Must NOT do**:
  - Don't remove any kernel schema handling
  - Don't change the output format of collectPolicies

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Code deletion and minor logic update
  - **Skills**: [`frontend-ui-ux`]
    - `frontend-ui-ux`: JavaScript refactoring

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Tasks 2, 4)
  - **Blocks**: Task 6
  - **Blocked By**: None

  **References**:
  - `example/debug-ui/index.html:1285-1332` - Legacy rendering branch to remove
  - `example/debug-ui/index.html:1408-1439` - collectLegacyPolicy function to remove
  - `example/debug-ui/index.html:1441-1451` - collectPolicies calls collectLegacyPolicy

  **Acceptance Criteria**:
  - [ ] `collectLegacyPolicy` function does not exist in file
  - [ ] `getPolicyBodyHTML` has no `else` branch checking legacy
  - [ ] `collectKernelPolicy` reads domains from POLICIES
  - [ ] File is ~100 lines shorter

  **Agent-Executed QA Scenarios**:
  ```
  Scenario: Legacy code removed
    Tool: Bash (grep)
    Preconditions: None
    Steps:
      1. grep -c "collectLegacyPolicy" example/debug-ui/index.html
      2. Assert: output is 0
      3. grep -c "filesystem.allowRead" example/debug-ui/index.html
      4. Assert: output is 0
    Expected Result: No legacy code references
    Evidence: grep counts

  Scenario: File size reduced
    Tool: Bash (wc)
    Preconditions: None
    Steps:
      1. wc -l example/debug-ui/index.html
      2. Assert: line count < 1800 (currently ~1897)
    Expected Result: Significant code reduction
    Evidence: Line count
  ```

  **Commit**: YES (combined with other Wave 2 tasks)
  - Message: `refactor(debug-ui): remove legacy policy schema support`
  - Files: `example/debug-ui/index.html`

---

- [x] 6. Playwright verification of complete functionality

  **What to do**:
  - Start debug-ui server: `bun src/main.ts --debug-ui`
  - Run comprehensive Playwright tests:
    - Example selection auto-configures policies
    - Policy cards show only relevant domain controls
    - Composite policy shows multiple domains
    - Run Code sends correct policy structure via WebSocket
  - Capture evidence screenshots

  **Must NOT do**:
  - Don't modify any source files
  - Don't leave server running after test

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Test execution only
  - **Skills**: [`playwright`]
    - `playwright`: Browser automation, assertions, screenshots

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 3 (final)
  - **Blocks**: None
  - **Blocked By**: Tasks 2, 4, 5

  **References**:
  - All previous task acceptance criteria
  - `example/debug-ui/index.html` - Final state to verify

  **Acceptance Criteria**:
  - [ ] All QA scenarios from Tasks 2, 4 pass
  - [ ] Evidence screenshots captured in .sisyphus/evidence/
  - [ ] No JavaScript console errors during test

  **Agent-Executed QA Scenarios**:
  ```
  Scenario: Full workflow - example to execution
    Tool: Playwright (playwright skill)
    Preconditions: Debug-ui server running on localhost:3000
    Steps:
      1. Navigate to: http://localhost:3000
      2. Wait for: WebSocket connected (#conn-dot.connected)
      3. Select: "fs_allow_tmp" in #template-select
      4. Wait for: 500ms
      5. Assert: FSAllowlistPolicy is active
      6. Click: .btn-primary (Run Code)
      7. Wait for: #output contains text (timeout: 5s)
      8. Assert: No "ERROR:" in #output
      9. Screenshot: .sisyphus/evidence/task-6-full-workflow.png
    Expected Result: Code runs with FS policy applied
    Evidence: .sisyphus/evidence/task-6-full-workflow.png

  Scenario: No console errors
    Tool: Playwright (playwright skill)
    Preconditions: Debug-ui server running
    Steps:
      1. Navigate to: http://localhost:3000
      2. Collect console errors via page.on('console')
      3. Select 3 different templates
      4. Expand/collapse policy cards
      5. Assert: No console.error() calls captured
    Expected Result: Clean console
    Evidence: Console log captured
  ```

  **Commit**: NO (verification only)

---

## Commit Strategy

| After Task | Message | Files | Verification |
|------------|---------|-------|--------------|
| 1 | `feat(debug-ui): add recommendedPolicies mapping to exampleCatalog` | exampleCatalog.ts | grep count |
| 2, 3, 4, 5 (combined) | `feat(debug-ui): restructure policies with auto-config and domain focus` | index.html | Playwright |

---

## Success Criteria

### Verification Commands
```bash
# Check exampleCatalog has recommendedPolicies
grep -c "recommendedPolicies" example/debug-ui/exampleCatalog.ts  # Expected: >= 17

# Check POLICIES has domains
grep -c '"domains":' example/debug-ui/index.html  # Expected: >= 6

# Check legacy code removed
grep -c "collectLegacyPolicy" example/debug-ui/index.html  # Expected: 0

# Check file size reduced
wc -l example/debug-ui/index.html  # Expected: < 1800 lines

# Start server and verify manually
bun src/main.ts --debug-ui  # Open http://localhost:3000
```

### Final Checklist
- [ ] 17 examples have `recommendedPolicies` field
- [ ] 6 policies with `domains` metadata
- [ ] FSAllowlistPolicy shows only FS controls
- [ ] LambdaBackendPolicy shows FS+NET+EXEC controls
- [ ] Example selection auto-enables correct policies
- [ ] Legacy code removed (~100 lines saved)
- [ ] No JavaScript console errors
- [ ] Playwright evidence captured
