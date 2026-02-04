# Buntime Documentation Plan

## TL;DR

> **Quick Summary**: Create 6 comprehensive documentation files for buntime, restructuring the README and adding architecture, policies, integration, debug-ui, and development guides.
> 
> **Deliverables**:
> - Restructured README.md with quick start and value proposition
> - docs/ARCHITECTURE.md with detailed system design
> - docs/POLICIES.md with policy schema reference and best practices
> - docs/INTEGRATION.md for programmatic usage and deployment
> - docs/DEBUG-UI.md for web interface usage
> - docs/DEVELOPMENT.md for contributors
> 
> **Estimated Effort**: Medium (6 documents, ~50-100 pages total)
> **Parallel Execution**: YES - 3 waves (README first, then ARCH/POLICIES in parallel, then remaining)
> **Critical Path**: README.md → ARCHITECTURE.md → DEVELOPMENT.md

---

## Context

### Original Request
Create a comprehensive documentation plan for buntime covering 6 documents:
1. README.md restructure
2. docs/ARCHITECTURE.md
3. docs/POLICIES.md
4. docs/INTEGRATION.md
5. docs/DEBUG-UI.md
6. docs/DEVELOPMENT.md

### Interview Summary
**Key Discussions**:
- Current documentation is ~45% complete with major gaps in user-facing guides
- Technical specs exist in docs/specs/ but need restructuring
- 22 example templates exist with no usage documentation
- Known limitations need explicit documentation

**Research Findings**:
- IPC: Shared memory ring buffers, Unix socket control plane, [u32 len][payload] framing
- Sandbox: Linux namespaces (NEWNS, NEWIPC, NEWPID, NEWNET, NEWUTS), veth networking
- Policy: JSON Schema v1, priority resolution (deny > warn > allow), composition via mergePolicies()
- Debug UI: WebSocket real-time updates, policy cards, telemetry visualization

### Metis Review
**Identified Gaps** (addressed):
1. Platform confusion (Linux vs macOS) → Added Platform Support matrix requirement
2. Architecture state confusion (existing "Refactor Plan") → Document code AS-IS only
3. Security promises risk → Added "Security Guarantees & Limitations" section
4. Migration of existing docs/specs/ content → Planned merge/migration strategy
5. INTEGRATION.md scope ambiguity → Clarified as consumer-focused

---

## Work Objectives

### Core Objective
Create a complete, user-friendly documentation suite that enables developers to understand, use, and contribute to buntime.

### Concrete Deliverables
1. `/README.md` - Restructured with value proposition, quick start, architecture overview
2. `/docs/ARCHITECTURE.md` - Detailed system design and component interactions
3. `/docs/POLICIES.md` - Policy schema reference, design patterns, best practices
4. `/docs/INTEGRATION.md` - Programmatic API, configuration, deployment patterns
5. `/docs/DEBUG-UI.md` - Web interface guide with screenshots/descriptions
6. `/docs/DEVELOPMENT.md` - Contributing guidelines, testing, known issues

### Definition of Done
- [x] All 6 documents created with specified sections
- [x] README quick start commands are copy-paste executable
- [x] POLICIES.md contains valid, lintable JSON example
- [x] ARCHITECTURE.md maps correctly to codebase structure
- [x] docs/specs/ content migrated or removed (no duplication)
- [x] Known limitations documented in appropriate sections

### Must Have
- Platform Support matrix in README and ARCHITECTURE
- Full JSON policy schema reference in POLICIES.md
- WebSocket protocol documentation in DEBUG-UI.md
- Testing commands in DEVELOPMENT.md

### Must NOT Have (Guardrails)
- DO NOT document unimplemented features from "Refactor Plan"
- DO NOT create new code examples (reference existing 22 templates)
- DO NOT overstate security guarantees
- DO NOT leave docs/specs/ files as duplicates
- DO NOT assume macOS has full sandbox support (it doesn't)

---

## Verification Strategy

> **UNIVERSAL RULE: ZERO HUMAN INTERVENTION**
>
> ALL tasks in this plan MUST be verifiable WITHOUT any human action.

### Test Decision
- **Infrastructure exists**: N/A (documentation task)
- **Automated tests**: NO (writing category)
- **Agent-Executed QA**: ALWAYS (mandatory for all tasks)

### Agent-Executed QA Scenarios (MANDATORY)

**For Documentation Tasks:**
- Markdown linting via `npx markdownlint-cli`
- Link validation via grep/search for broken references
- JSON examples validated via `bun` or `node` parse
- Command examples executed in isolated environment

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Start Immediately):
└── Task 1: README.md restructure [foundational, sets tone]

Wave 2 (After Wave 1):
├── Task 2: docs/ARCHITECTURE.md [independent, technical depth]
└── Task 3: docs/POLICIES.md [independent, reference doc]

Wave 3 (After Wave 2):
├── Task 4: docs/DEBUG-UI.md [depends on ARCHITECTURE understanding]
├── Task 5: docs/INTEGRATION.md [depends on ARCHITECTURE, POLICIES]
└── Task 6: docs/DEVELOPMENT.md [depends on all, summarizes]

Wave 4 (Final):
└── Task 7: Cleanup and cross-reference validation
```

### Dependency Matrix

| Task | Depends On | Blocks | Can Parallelize With |
|------|------------|--------|---------------------|
| 1 | None | 2, 3, 4, 5, 6, 7 | None (foundational) |
| 2 | 1 | 4, 5, 6, 7 | 3 |
| 3 | 1 | 5, 6, 7 | 2 |
| 4 | 2 | 7 | 5, 6 |
| 5 | 2, 3 | 7 | 4, 6 |
| 6 | 2, 3 | 7 | 4, 5 |
| 7 | 4, 5, 6 | None | None (final) |

### Agent Dispatch Summary

| Wave | Tasks | Recommended Category |
|------|-------|---------------------|
| 1 | 1 | writing |
| 2 | 2, 3 | writing (parallel) |
| 3 | 4, 5, 6 | writing (parallel) |
| 4 | 7 | quick |

---

## TODOs

- [x] 1. Restructure README.md

  **What to do**:
  - Add clear value proposition (2-3 sentences explaining what buntime solves)
  - Add Platform Support matrix (Linux native, Linux Docker, macOS limited)
  - Create Quick Start section with copy-paste commands
  - Add Architecture Overview with textual diagram
  - Add Feature Highlights section
  - Add links to detailed documentation
  - Keep existing install/docker commands but reorganize

  **Must NOT do**:
  - Do not promise macOS sandbox support
  - Do not document unimplemented "Refactor Plan" features
  - Do not add badges or external links that may break

  **Recommended Agent Profile**:
  - **Category**: `writing`
    - Reason: Documentation creation, prose-heavy, requires clear communication
  - **Skills**: []
    - No special skills needed - pure documentation

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 1 (solo)
  - **Blocks**: All other documentation tasks
  - **Blocked By**: None

  **References**:

  **Pattern References**:
  - `README.md` - Current README (18 lines, to be expanded)
  - `AGENTS.md` - Example of well-structured project documentation

  **Content References**:
  - `docs/specs/architecture.md` - Architecture overview content to extract
  - `docs/specs/cli.md` - CLI usage examples for Quick Start
  - `docs/specs/docker.md` - Docker deployment for Quick Start

  **Research References**:
  - Background agent output on project structure exploration

  **WHY Each Reference Matters**:
  - Current README shows baseline to improve from
  - AGENTS.md demonstrates documentation structure patterns used in this project
  - Architecture/CLI/Docker specs contain content to migrate to README

  **Acceptance Criteria**:

  **Agent-Executed QA Scenarios:**

  ```
  Scenario: README renders valid markdown
    Tool: Bash (markdownlint)
    Preconditions: markdownlint-cli installed
    Steps:
      1. npx markdownlint-cli README.md
      2. Assert: exit code 0
      3. Assert: no warnings or errors in output
    Expected Result: Valid markdown with no lint errors
    Evidence: Command output captured

  Scenario: Quick Start commands execute successfully
    Tool: Bash
    Preconditions: Bun installed, fresh clone of repo
    Steps:
      1. Extract Quick Start commands from README.md
      2. Run: bun install
      3. Assert: exit code 0
      4. Run: bun src/main.ts --help OR documented basic command
      5. Assert: exit code 0 or expected output
    Expected Result: Commands from README work as documented
    Evidence: Command outputs captured

  Scenario: All internal links resolve
    Tool: Bash (grep + file check)
    Preconditions: None
    Steps:
      1. grep -oE '\[.*\]\(docs/[^)]+\)' README.md
      2. For each matched path, verify file exists
      3. Assert: all referenced files exist
    Expected Result: No broken internal links
    Evidence: Link check results
  ```

  **Commit**: YES
  - Message: `docs(readme): restructure with value proposition, quick start, and platform support`
  - Files: `README.md`
  - Pre-commit: `npx markdownlint-cli README.md`

---

- [x] 2. Create docs/ARCHITECTURE.md

  **What to do**:
  - Document Supervisor-Worker model with component responsibilities
  - Explain Data Plane (shared memory ring buffers, message framing)
  - Explain Control Plane (Unix domain sockets, signaling protocol)
  - Document sandbox/namespace setup sequence (Linux only)
  - Explain network isolation (veth pairs, proxy)
  - Add Platform Support section with Linux vs macOS capabilities
  - Create textual architecture diagrams
  - Map to actual codebase structure (src/ipc/, src/sandbox/, etc.)
  - Migrate relevant content from docs/specs/architecture.md

  **Must NOT do**:
  - Do not document "Refactor Plan" as current functionality
  - Do not document eBPF telemetry as complete (it's deferred)
  - Do not leave docs/specs/architecture.md as duplicate

  **Recommended Agent Profile**:
  - **Category**: `writing`
    - Reason: Technical documentation requiring clear explanation of complex systems
  - **Skills**: []
    - No special skills needed

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Task 3)
  - **Blocks**: Tasks 4, 5, 6, 7
  - **Blocked By**: Task 1

  **References**:

  **Pattern References**:
  - `docs/specs/architecture.md:1-75` - Existing architecture spec to migrate/expand
  - `AGENTS.md:8-30` - Architecture overview section format

  **Implementation References**:
  - `src/ipc/server.ts` - IPCServer implementation details
  - `src/ipc/ringbuffer.ts` - Ring buffer mechanics
  - `src/ipc/protocol.ts` - Message types (MsgType enum)
  - `src/sandbox/launcher.ts` - Namespace setup sequence
  - `src/supervisor/supervisor.ts` - Supervisor orchestration
  - `src/proxy.ts` - Network proxy implementation

  **Research References**:
  - Background agent output on IPC/sandbox exploration (comprehensive data flow diagram)

  **WHY Each Reference Matters**:
  - Existing architecture.md has structure to follow/expand
  - Implementation files provide accurate technical details
  - Research output contains pre-made data flow diagrams

  **Acceptance Criteria**:

  **Agent-Executed QA Scenarios:**

  ```
  Scenario: Architecture doc validates markdown
    Tool: Bash (markdownlint)
    Steps:
      1. npx markdownlint-cli docs/ARCHITECTURE.md
      2. Assert: exit code 0
    Expected Result: Valid markdown
    Evidence: Lint output

  Scenario: Codebase paths mentioned exist
    Tool: Bash (grep + ls)
    Steps:
      1. grep -oE 'src/[a-zA-Z0-9_/.-]+' docs/ARCHITECTURE.md
      2. For each path, verify exists in filesystem
      3. Assert: all paths exist
    Expected Result: No references to non-existent paths
    Evidence: Path verification results

  Scenario: Old architecture.md is superseded
    Tool: Bash
    Steps:
      1. Check if docs/specs/architecture.md still exists
      2. If exists, verify it contains deprecation notice pointing to new doc
      3. OR verify file is deleted
    Expected Result: No duplicate architecture documentation
    Evidence: File state captured
  ```

  **Commit**: YES
  - Message: `docs(architecture): add comprehensive system architecture documentation`
  - Files: `docs/ARCHITECTURE.md`, potentially `docs/specs/architecture.md` (deprecate/remove)
  - Pre-commit: `npx markdownlint-cli docs/ARCHITECTURE.md`

---

- [x] 3. Create docs/POLICIES.md

  **What to do**:
  - Document full JSON policy schema (v1) with all fields explained
  - Explain policy domains: fs, net, exec, antiEscape, audit
  - Document action types: allow, deny, warn (with limitations)
  - Explain priority resolution: deny > warn > allow > default
  - Document each pre-built policy set with use cases:
    - FSAllowlistPolicy
    - NetEgressPolicy
    - ExecPolicy
    - AntiEscapePolicy
    - EBPFAuditPolicy
    - LambdaBackendPolicy (composite)
  - Add policy composition section (mergePolicies behavior)
  - Include Security Guarantees & Limitations section
  - Provide example policies for common scenarios
  - Document known limitation: "warn" action only logs to server, not UI

  **Must NOT do**:
  - Do not create new policy files (reference existing ones)
  - Do not overstate security guarantees
  - Do not document seccomp-unotify as implemented (it's planned)

  **Recommended Agent Profile**:
  - **Category**: `writing`
    - Reason: Reference documentation requiring accuracy and completeness
  - **Skills**: []
    - No special skills needed

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Task 2)
  - **Blocks**: Tasks 5, 6, 7
  - **Blocked By**: Task 1

  **References**:

  **Schema References**:
  - `src/sandbox/policy/schema.json` - Complete JSON schema definition
  - `src/sandbox/policy/loader.ts` - Policy normalization logic
  - `src/sandbox/policy/enforcer.ts` - Priority resolution (resolveAction)
  - `src/sandbox/policy/set.ts` - Policy composition (mergePolicies)

  **Policy File References**:
  - `src/policies/default.json` - Open policy example
  - `src/policies/fs-allowlist.json` - FS restriction example
  - `src/policies/net-egress.json` - Network restriction with warns
  - `src/policies/anti-escape.json` - Syscall blocking
  - `src/policies/exec-policy.json` - Execution control
  - `src/policies/ebpf-audit.json` - Audit configuration

  **Research References**:
  - Background agent output on policy system exploration (complete schema docs)

  **WHY Each Reference Matters**:
  - schema.json is the authoritative reference for policy structure
  - Enforcer shows how resolution actually works
  - Policy files provide real examples to document

  **Acceptance Criteria**:

  **Agent-Executed QA Scenarios:**

  ```
  Scenario: POLICIES.md validates markdown
    Tool: Bash (markdownlint)
    Steps:
      1. npx markdownlint-cli docs/POLICIES.md
      2. Assert: exit code 0
    Expected Result: Valid markdown
    Evidence: Lint output

  Scenario: Example JSON policies are valid
    Tool: Bash (bun/node)
    Steps:
      1. Extract JSON code blocks from docs/POLICIES.md
      2. For each JSON block, run: echo '<json>' | bun -e "JSON.parse(require('fs').readFileSync(0, 'utf8'))"
      3. Assert: all parse successfully
    Expected Result: All JSON examples are syntactically valid
    Evidence: Parse results

  Scenario: All policy file references exist
    Tool: Bash (grep + ls)
    Steps:
      1. grep -oE 'src/policies/[a-zA-Z0-9_.-]+\.json' docs/POLICIES.md
      2. Verify each file exists
      3. Assert: all referenced policy files exist
    Expected Result: No broken policy file references
    Evidence: File verification results
  ```

  **Commit**: YES
  - Message: `docs(policies): add policy schema reference and best practices guide`
  - Files: `docs/POLICIES.md`
  - Pre-commit: `npx markdownlint-cli docs/POLICIES.md`

---

- [x] 4. Create docs/DEBUG-UI.md

  **What to do**:
  - Document how to start Debug UI (--debug-ui flag, PORT env)
  - Explain UI layout and features:
    - Code execution panel
    - Policy configuration cards (6 built-in policies)
    - Telemetry visualization (ring buffer, syscall heatmap)
    - Audit events display
  - Document WebSocket protocol (client→server and server→client messages)
  - Explain API endpoints (/ws, /examples, /examples/:id)
  - Document example template catalog and how to use them
  - Include Known Limitations section:
    - "warn" action only logs to console, not visible in UI
    - IPC protocol lacks WARN response type
  - Provide workflow examples (run code, apply policy, view telemetry)

  **Must NOT do**:
  - Do not add actual screenshots (describe what user would see instead)
  - Do not document features that don't exist

  **Recommended Agent Profile**:
  - **Category**: `writing`
    - Reason: User-facing documentation with workflow explanations
  - **Skills**: []
    - No special skills needed

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3 (with Tasks 5, 6)
  - **Blocks**: Task 7
  - **Blocked By**: Task 2

  **References**:

  **Implementation References**:
  - `example/debug-ui/server.ts` - HTTP/WebSocket server implementation
  - `example/debug-ui/index.html` - UI structure and client-side logic
  - `example/debug-ui/exampleCatalog.ts` - Template catalog (22 examples)
  - `src/supervisor/supervisor.ts:onEvent` - Event types emitted

  **Research References**:
  - Background agent output on Debug UI exploration (comprehensive feature list)

  **WHY Each Reference Matters**:
  - server.ts shows exact API endpoints and WebSocket protocol
  - exampleCatalog.ts documents all available templates
  - Research output has complete feature inventory

  **Acceptance Criteria**:

  **Agent-Executed QA Scenarios:**

  ```
  Scenario: DEBUG-UI.md validates markdown
    Tool: Bash (markdownlint)
    Steps:
      1. npx markdownlint-cli docs/DEBUG-UI.md
      2. Assert: exit code 0
    Expected Result: Valid markdown
    Evidence: Lint output

  Scenario: Documented API endpoints exist
    Tool: Bash (grep + code search)
    Steps:
      1. Extract API endpoints from docs/DEBUG-UI.md (e.g., /ws, /examples)
      2. grep for each endpoint in example/debug-ui/server.ts
      3. Assert: all endpoints found in code
    Expected Result: All documented endpoints exist in implementation
    Evidence: Grep results

  Scenario: Known limitations section exists
    Tool: Bash (grep)
    Steps:
      1. grep -i "limitation" docs/DEBUG-UI.md
      2. grep -i "warn" docs/DEBUG-UI.md (for the warn action limitation)
      3. Assert: both topics are addressed
    Expected Result: Known limitations are documented
    Evidence: Grep matches
  ```

  **Commit**: YES
  - Message: `docs(debug-ui): add web interface usage guide`
  - Files: `docs/DEBUG-UI.md`
  - Pre-commit: `npx markdownlint-cli docs/DEBUG-UI.md`

---

- [x] 5. Create docs/INTEGRATION.md

  **What to do**:
  - Document programmatic usage (importing Supervisor class)
  - Explain configuration options (SandboxConfig interface)
  - Document CLI usage with all flags (from docs/specs/cli.md)
  - Explain environment variable configuration (POD_* variables)
  - Document Docker deployment patterns (from docs/specs/docker.md)
  - Add Lambda-like integration example
  - Explain worker types (Python vs Bun workers)
  - Document IPC protocol for custom worker implementations

  **Must NOT do**:
  - Do not create new example code (reference existing)
  - Do not duplicate CLI/Docker docs verbatim (merge and improve)

  **Recommended Agent Profile**:
  - **Category**: `writing`
    - Reason: Technical integration documentation for consumers
  - **Skills**: []
    - No special skills needed

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3 (with Tasks 4, 6)
  - **Blocks**: Task 7
  - **Blocked By**: Tasks 2, 3

  **References**:

  **Existing Docs to Migrate**:
  - `docs/specs/cli.md` - CLI specification (complete, to be merged)
  - `docs/specs/docker.md` - Docker specification (complete, to be merged)

  **Implementation References**:
  - `src/supervisor/supervisor.ts:SupervisorOptions` - Configuration interface
  - `src/config.ts:SandboxConfig` - Full config schema
  - `src/main.ts` - Entry point usage example
  - `src/cli.ts` - CLI implementation

  **WHY Each Reference Matters**:
  - CLI/Docker specs contain authoritative content to migrate
  - Config files show all available options
  - main.ts shows minimal usage pattern

  **Acceptance Criteria**:

  **Agent-Executed QA Scenarios:**

  ```
  Scenario: INTEGRATION.md validates markdown
    Tool: Bash (markdownlint)
    Steps:
      1. npx markdownlint-cli docs/INTEGRATION.md
      2. Assert: exit code 0
    Expected Result: Valid markdown
    Evidence: Lint output

  Scenario: CLI flags documented match implementation
    Tool: Bash (grep comparison)
    Steps:
      1. Extract CLI flags from docs/INTEGRATION.md
      2. grep for each flag in src/cli.ts
      3. Assert: all documented flags exist in code
    Expected Result: No undocumented or outdated flags
    Evidence: Flag comparison results

  Scenario: Old specs marked as superseded or removed
    Tool: Bash
    Steps:
      1. Check docs/specs/cli.md and docs/specs/docker.md
      2. Assert: either contain deprecation notice OR are removed
    Expected Result: No duplicate integration documentation
    Evidence: File state
  ```

  **Commit**: YES
  - Message: `docs(integration): add programmatic usage and deployment guide`
  - Files: `docs/INTEGRATION.md`, `docs/specs/cli.md` (deprecate), `docs/specs/docker.md` (deprecate)
  - Pre-commit: `npx markdownlint-cli docs/INTEGRATION.md`

---

- [x] 6. Create docs/DEVELOPMENT.md

  **What to do**:
  - Document development environment setup
  - Explain testing strategy (reference TESTING_PLAN.md)
  - Document available test commands (bun test, etc.)
  - Explain project structure with directory purposes
  - Document contributing guidelines (code style from AGENTS.md)
  - Reference the 22 example templates and how to run them
  - Document known limitations and roadmap (from MISSING_FEATURES.md)
  - Add troubleshooting section for common issues

  **Must NOT do**:
  - Do not duplicate AGENTS.md content (reference it)
  - Do not create new example scripts

  **Recommended Agent Profile**:
  - **Category**: `writing`
    - Reason: Contributor documentation with procedural focus
  - **Skills**: []
    - No special skills needed

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3 (with Tasks 4, 5)
  - **Blocks**: Task 7
  - **Blocked By**: Tasks 2, 3

  **References**:

  **Existing Docs**:
  - `AGENTS.md` - Code style, commands, architecture overview
  - `TESTING_PLAN.md` - Comprehensive testing strategy
  - `MISSING_FEATURES.md` - Future work and roadmap

  **Structure References**:
  - `src/` directory structure for project layout documentation
  - `example/` directory for example template documentation

  **Research References**:
  - Background agent output on project structure exploration

  **WHY Each Reference Matters**:
  - AGENTS.md has code style and conventions to reference (not duplicate)
  - TESTING_PLAN.md has testing approach to summarize
  - Project structure exploration provides accurate directory descriptions

  **Acceptance Criteria**:

  **Agent-Executed QA Scenarios:**

  ```
  Scenario: DEVELOPMENT.md validates markdown
    Tool: Bash (markdownlint)
    Steps:
      1. npx markdownlint-cli docs/DEVELOPMENT.md
      2. Assert: exit code 0
    Expected Result: Valid markdown
    Evidence: Lint output

  Scenario: Test commands documented work
    Tool: Bash
    Steps:
      1. Extract test commands from docs/DEVELOPMENT.md
      2. Run: bun test --help (or documented test command)
      3. Assert: exit code 0 or expected output
    Expected Result: Test commands are accurate
    Evidence: Command output

  Scenario: Example directory reference is accurate
    Tool: Bash
    Steps:
      1. Count example files in example/ directory
      2. Assert: matches "22 example templates" claim (or actual count)
    Expected Result: Example count is accurate
    Evidence: ls | wc -l result
  ```

  **Commit**: YES
  - Message: `docs(development): add contributing guidelines and project structure`
  - Files: `docs/DEVELOPMENT.md`
  - Pre-commit: `npx markdownlint-cli docs/DEVELOPMENT.md`

---

- [x] 7. Cleanup and cross-reference validation

  **What to do**:
  - Verify all internal links between docs work
  - Ensure no duplicate content between new docs and docs/specs/
  - Remove or deprecate obsolete docs/specs/ files
  - Create docs/index.md or update README with docs navigation
  - Final markdown lint on all new documents

  **Must NOT do**:
  - Do not delete files without checking for external references

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Validation and cleanup task, minimal creative work
  - **Skills**: []
    - No special skills needed

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 4 (solo, final)
  - **Blocks**: None (final task)
  - **Blocked By**: Tasks 4, 5, 6

  **References**:
  - All newly created docs
  - `docs/specs/` directory for cleanup candidates

  **Acceptance Criteria**:

  **Agent-Executed QA Scenarios:**

  ```
  Scenario: All internal links resolve
    Tool: Bash
    Steps:
      1. Find all markdown links in docs/*.md and README.md
      2. For relative links (docs/*, ./*, ../), verify target exists
      3. Assert: all internal links resolve
    Expected Result: Zero broken internal links
    Evidence: Link check results

  Scenario: No duplicate documentation
    Tool: Bash
    Steps:
      1. Check docs/specs/*.md files
      2. Assert: each either deleted OR contains deprecation notice
    Expected Result: Single source of truth for each topic
    Evidence: File state

  Scenario: All new docs pass lint
    Tool: Bash
    Steps:
      1. npx markdownlint-cli README.md docs/*.md
      2. Assert: exit code 0
    Expected Result: All documentation lint-clean
    Evidence: Lint output
  ```

  **Commit**: YES
  - Message: `docs: finalize documentation structure and cross-references`
  - Files: Updated docs, removed/deprecated specs
  - Pre-commit: `npx markdownlint-cli README.md docs/*.md`

---

## Commit Strategy

| After Task | Message | Files | Verification |
|------------|---------|-------|--------------|
| 1 | `docs(readme): restructure with value proposition and quick start` | README.md | markdownlint |
| 2 | `docs(architecture): add comprehensive system architecture` | docs/ARCHITECTURE.md | markdownlint |
| 3 | `docs(policies): add policy schema reference and best practices` | docs/POLICIES.md | markdownlint |
| 4 | `docs(debug-ui): add web interface usage guide` | docs/DEBUG-UI.md | markdownlint |
| 5 | `docs(integration): add programmatic usage and deployment` | docs/INTEGRATION.md | markdownlint |
| 6 | `docs(development): add contributing guidelines` | docs/DEVELOPMENT.md | markdownlint |
| 7 | `docs: finalize documentation structure` | various | markdownlint all |

---

## Success Criteria

### Verification Commands
```bash
# Lint all documentation
npx markdownlint-cli README.md docs/*.md  # Expected: exit 0

# Verify quick start works
bun install  # Expected: success
bun src/main.ts --help  # Expected: help output

# Count example templates
ls example/*.py | wc -l  # Expected: ~17 (or documented count)
```

### Final Checklist
- [ ] All 6 documents created per specifications
- [ ] README quick start commands are executable
- [ ] POLICIES.md JSON examples parse correctly
- [ ] ARCHITECTURE.md codebase paths all exist
- [ ] docs/specs/ content migrated (no duplicates)
- [ ] Known limitations documented in appropriate places
- [ ] All internal links resolve
- [ ] All documents pass markdownlint
