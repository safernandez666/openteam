# Workflow Templates

OpenTeam ships with **5 built-in workflow templates**. Each defines a multi-phase execution path with specific roles, exit criteria, and automatic advancement.

## Overview

| Template | Phases | Trigger Keywords | Best For |
|----------|--------|------------------|----------|
| [Bug Fix](#bug-fix) | 5 | bug, fix, broken, error, crash, issue, falla, rompe, no funciona | Debugging, incidents, regressions |
| [Feature](#feature-implementation) | 6 | feature, add, implement, build, create, nueva, agregar | New functionality, user stories |
| [Quick Refinement](#quick-refinement) | 3 | tweak, adjust, polish, update, small, cambio chico | Minor changes, copy updates, quick fixes |
| [Refactoring](#refactoring) | 5 | refactor, rewrite, clean up, reorganize, refactorizar | Code quality, tech debt, migrations |
| [Security Audit](#security-audit) | 5 | security, audit, vulnerability, auth, seguridad, auditoría | Security reviews, compliance, hardening |

Facu auto-detects the workflow type from your message using keyword matching. You can also manually select a workflow in the UI.

---

## Bug Fix

**Goal:** Find, fix, and verify a bug with full traceability.

### Phase 1: Triage & Reproduce
- **Role:** PM (Facu)
- **Agent Type:** Direct (no spawn)
- **What happens:** Facu asks clarifying questions, confirms the bug, assesses severity, documents reproduction steps
- **Exit Criteria:**
  - [ ] Bug confirmed with reproduction steps
  - [ ] Severity assessed (Critical/High/Medium/Low)
  - [ ] Tracker issue created with `[Bug]` prefix
- **Gates:** blast-radius, secret-scan

### Phase 2: Root Cause Analysis
- **Role:** Developer (Lucas)
- **What happens:** Search codebase, identify root cause, list affected files
- **Exit Criteria:**
  - [ ] Root cause identified
  - [ ] Affected files listed
  - [ ] Approach validated (no breaking changes)
- **Context Injected:** Triage results, reproduction steps, severity

### Phase 3: Fix Implementation
- **Role:** Developer (Lucas)
- **What happens:** Code the minimal fix, run tests locally
- **Exit Criteria:**
  - [ ] Fix implemented
  - [ ] No regressions introduced
  - [ ] Build passes
- **Gates:** deterministic-checks (lint/test/build), blast-radius, fast-review

### Phase 4: Verification
- **Role:** Tester (Max)
- **What happens:** Write/regression tests, confirm bug no longer reproduces
- **Exit Criteria:**
  - [ ] Tests pass
  - [ ] Bug no longer reproduces with original steps
  - [ ] Adjacent functionality unaffected
- **Gates:** regression-test

### Phase 5: Delivery
- **Role:** Reviewer (Ana)
- **What happens:** Code review, approve, close
- **Exit Criteria:**
  - [ ] Code reviewed
  - [ ] PR approved (or direct merge if trivial)
  - [ ] Issue closed

### Branch Strategy
```
fix/<ticket-id>-<short-description>
```

---

## Feature Implementation

**Goal:** Deliver a complete feature from idea to merge.

### Phase 0: Brainstorm (Optional)
- **Role:** PM (Facu)
- **When:** Skip if approach is obvious
- **What happens:** Explore alternatives, define requirements, select approach
- **Output:** Requirements doc + approach selection

### Phase 1: Research
- **Role:** Developer (Lucas)
- **What happens:** Search codebase, check dependencies, evaluate approach
- **Exit Criteria:**
  - [ ] Approach validated against existing code
  - [ ] Dependencies identified
  - [ ] No blockers found
- **Context Injected:** Requirements, brainstorm output

### Phase 2: Foundation
- **Role:** Developer (Lucas) / Designer (Sofia) if UI-heavy
- **What happens:** Scaffold, setup, create base components, design tokens
- **Exit Criteria:**
  - [ ] Base structure created
  - [ ] Build passes
  - [ ] Foundation reviewed (if visual)
- **Gates:** deterministic-checks, dependency-audit

### Phase 3: Integration
- **Role:** Developer (Lucas)
- **What happens:** Wire components, connect APIs, implement business logic
- **Exit Criteria:**
  - [ ] Feature functional end-to-end
  - [ ] Build passes
  - [ ] No console errors
- **Gates:** deterministic-checks, blast-radius, fast-review

### Phase 4: Validation
- **Role:** Tester (Max)
- **What happens:** Tests, lint, build verification, browser checks if UI
- **Exit Criteria:**
  - [ ] Tests pass
  - [ ] No lint errors
  - [ ] Browser testing passes (if UI changes)
- **Gates:** browser-test, regression-test, smoke-test

### Phase 5: Delivery
- **Role:** Reviewer (Ana)
- **What happens:** Final review, merge
- **Exit Criteria:**
  - [ ] Code reviewed
  - [ ] Ready to merge

### Branch Strategy
```
feat/<ticket-id>-<short-description>
```

### Foundation-First Pattern
For features with 2+ pages/views and no existing design system:

```
Phase 2a: Foundation (Design tokens, layout, component library)
    └── All visual tasks → depends_on: [foundation]

Phase 3+: Page tasks (parallel)
    └── Consume tokens — never create new values
```

---

## Quick Refinement

**Goal:** Fast, low-risk tweaks without full workflow overhead.

### Phase 1: Triage
- **Role:** PM (Facu)
- **What happens:** Confirm scope, decide if tracking needed
- **Exit Criteria:**
  - [ ] Scope defined (< 3 files ideally)
  - [ ] Risk assessed as low

### Phase 2: Implementation
- **Role:** Developer (Lucas) or Designer (Sofia)
- **What happens:** Make the change
- **Exit Criteria:**
  - [ ] Change implemented
  - [ ] Build passes
- **Gates:** deterministic-checks (lightweight)

### Phase 3: Verification
- **Role:** PM (Facu)
- **What happens:** Quick visual/code check, close
- **Exit Criteria:**
  - [ ] Change verified
  - [ ] No follow-up needed

### When to Skip Tracking
Skip tracker issue if **ALL** true:
- Pure cosmetic/spacing/copy change
- Isolated to single component/page
- Trivial to verify visually

Otherwise, create `[Follow-up]` tracker issue.

---

## Refactoring

**Goal:** Improve code quality without changing behavior.

### Phase 1: Scope & Baseline
- **Role:** PM (Facu)
- **What happens:** Identify files, document current behavior, record baseline metrics
- **Exit Criteria:**
  - [ ] File list defined
  - [ ] Baseline metrics recorded (test count, coverage, lint errors)
  - [ ] Tracker issue created

### Phase 2: Test Coverage Gap
- **Role:** Tester (Max)
- **What happens:** Write missing tests for current behavior **BEFORE** touching code
- **Exit Criteria:**
  - [ ] Tests written for all functions being refactored
  - [ ] All new tests pass against current code
  - [ ] Coverage measured

### Phase 3: Refactor Implementation
- **Role:** Developer (Lucas)
- **What happens:** Refactor code, keep tests passing
- **Exit Criteria:**
  - [ ] Code refactored
  - [ ] All tests pass
  - [ ] No behavior changes
- **Gates:** deterministic-checks, blast-radius, fast-review

### Phase 4: Verification
- **Role:** Tester (Max)
- **What happens:** Confirm no behavior change, check performance
- **Exit Criteria:**
  - [ ] All tests pass
  - [ ] No regressions
  - [ ] Performance comparable or better

### Phase 5: Delivery
- **Role:** Reviewer (Ana)
- **What happens:** Review, merge
- **Exit Criteria:**
  - [ ] Code reviewed
- **Gates:** panel-review (for large refactors > 500 lines)

### Safety Rules
- **Never refactor without tests first**
- **Behavior must be identical** — if behavior changes, it's a feature, not refactor
- **Measure before and after** — bundle size, test count, lint errors

---

## Security Audit

**Goal:** Find and fix security vulnerabilities systematically.

### Phase 1: Scope
- **Role:** PM (Facu)
- **What happens:** Define audit boundaries, identify sensitive areas (auth, payments, PII)
- **Exit Criteria:**
  - [ ] Scope defined
  - [ ] Boundaries set
  - [ ] Tracker issue created with `[Security]` prefix

### Phase 2: Automated Scan
- **Role:** Security (Vera)
- **What happens:** Run security tools (dependency audit, secret scan, SAST)
- **Exit Criteria:**
  - [ ] Scan completed
  - [ ] Findings documented with severity
- **Gates:** secret-scan, dependency-audit

### Phase 3: Manual Review
- **Role:** Reviewer (Ana) + Security (Vera)
- **What happens:** Deep inspection of auth flows, input validation, headers, CSP
- **Exit Criteria:**
  - [ ] Review completed
  - [ ] Findings prioritized (Critical/High/Medium/Low)
- **Gates:** panel-review (security-critical changes)

### Phase 4: Remediation
- **Role:** Developer (Lucas)
- **What happens:** Fix findings in priority order
- **Exit Criteria:**
  - [ ] Critical/High findings addressed
  - [ ] Medium findings have tickets or accept risk documented

### Phase 5: Verification
- **Role:** Tester (Max)
- **What happens:** Re-run scans, verify fixes, check no regressions
- **Exit Criteria:**
  - [ ] Fixes verified
  - [ ] No new findings introduced
  - [ ] Re-scan clean (or accepted risks documented)
- **Gates:** regression-test, smoke-test

---

## Workflow Engine Internals

### Auto-Detection

Facu analyzes your message against keyword rules:

```typescript
const DETECTION_RULES = [
  { keywords: ["bug", "fix", "broken", "error", "crash"], templateId: "bug_fix" },
  { keywords: ["feature", "add", "implement", "build", "create"], templateId: "feature" },
  { keywords: ["refactor", "rewrite", "clean up"], templateId: "refactor" },
  { keywords: ["security", "audit", "vulnerability", "auth"], templateId: "security_audit" },
  { keywords: ["tweak", "adjust", "polish", "update", "small"], templateId: "quick_refinement" },
];
```

First match wins. If no match, Facu asks you to clarify or defaults to Feature.

### Phase Advancement

```
User creates task
    │
    ▼
WorkflowEngine.startWorkflow(taskId, templateId)
    │
    ├──▶ Create Phase 0 task (status: backlog)
    │
    ▼
Orchestrator assigns worker → worker completes
    │
    ▼
GateEngine.runGates(taskId)
    │
    ├──▶ All gates pass → WorkflowEngine.advancePhase()
    │       └── Create Phase 1 task
    │
    └──▶ Any gate fails → Task returns to in_progress
            └── Worker retries with gate feedback
```

### Context Between Phases

When Phase N completes, Phase N+1 worker receives:

```markdown
## Prior Phase Output

**Phase [N] — [Role] — [Task Title]**
- Files changed: src/components/Button.tsx, src/styles/button.css
- Decisions: Use CSS modules instead of styled-components
- Verification: lint ✅ | types ✅ | tests ❌
- Blockers: 2 tests failing on Button click handler
```

This is generated by the CompactionEngine, not raw worker output.

### Custom Workflows

You can create custom workflows via the UI or API:

```bash
POST /api/workflows/templates
{
  "id": "my-custom",
  "name": "Custom Workflow",
  "description": "...",
  "category": "custom",
  "phases": [
    {
      "index": 0,
      "name": "Phase 1",
      "role": "developer",
      "description": "...",
      "exit_criteria": ["Done"],
      "task_title_template": "[P1] {description}"
    }
  ]
}
```

Custom workflows:
- Appear in the workflow selector
- Can be edited and deleted
- Support the same gate assignments as built-ins

### Gate Assignments by Phase

| Workflow | Phase 1 | Phase 2 | Phase 3 | Phase 4 | Phase 5 |
|----------|---------|---------|---------|---------|---------|
| Bug Fix | blast-radius, secret-scan | — | deterministic, blast-radius, fast-review | regression-test | — |
| Feature | — | — | deterministic, dependency-audit | deterministic, blast-radius, fast-review | browser, regression, smoke |
| Quick Refinement | — | deterministic | — | — | — |
| Refactor | blast-radius | — | deterministic, blast-radius, fast-review | regression-test | panel-review (large) |
| Security Audit | — | secret-scan, dependency-audit | panel-review | — | regression-test, smoke-test |

---

## Workflow Stats

The Dashboard tracks per-workflow metrics:

| Metric | Source |
|--------|--------|
| Avg duration | `performance_events.duration_ms` grouped by workflow category |
| Phase completion rate | `workflow_instances.phase_data` vs total phases |
| Gate pass rate | `gate_executions` filtered by workflow |
| Tokens per workflow | `performance_events` input + output tokens |

Access via Dashboard or API:
```bash
GET /api/workflows/stats
GET /api/dashboard/workflows
```
