---
name: deep-file-testing
description: Use when the user asks to explore a codebase deeply file by file, think through the implementation thoroughly, add every valuable test type (unit, integration, component, contract, regression, live tests), iterate until no useful work remains, and commit the changes at the end. Trigger on requests like "Explore deeply file by file. Add all tests... Take your time... Commit the changes in the end."
---

# Deep File Testing

Use this for high-effort implementation or repair tasks where the user wants exhaustive codebase exploration, broad test coverage, repeated verification, and a final commit.

## Workflow

1. Build a compact working brief.
   - Goal and acceptance criteria
   - Known constraints and risks
   - Files, packages, routes, jobs, schemas, and tests likely in scope
   - External systems or credentials needed for live tests
2. Explore file by file.
   - Start from entrypoints, configs, package manifests, test setup, and changed or requested areas.
   - Trace callers and callees before editing shared behavior.
   - Keep an internal file ledger: read, relevant, changed, tested, skipped with reason.
   - Use subagents for independent exploration or verification when available and safe.
3. Plan milestones.
   - Keep author and reviewer work separate when practical.
   - Add an "Unresolved Questions" list at the end of the plan, using very short questions.
   - Do not stop for questions if a reversible, clearly useful milestone can proceed safely.
4. Implement one milestone at a time.
   - Prefer existing patterns, helpers, and test harnesses.
   - Keep diffs small enough to review.
   - Fix root causes in shared paths instead of patching only the reported symptom.
5. Add every valuable test.
   - Unit tests for pure logic, branches, validators, parsers, and utilities.
   - Integration tests for cross-module behavior, persistence, queues, API handlers, and CLI flows.
   - Component tests for UI state, accessibility basics, and user interactions.
   - Contract tests for external APIs, schemas, events, generated clients, and compatibility boundaries.
   - Regression tests for every bug fixed or edge case discovered.
   - Live tests only when credentials, cost, permissions, and side effects are acceptable; otherwise document the blocker and add a mock or contract test if it still gives signal.
6. Verify after each milestone.
   - Run the narrowest meaningful tests first.
   - Escalate to lint, typecheck, build, integration, e2e, or live checks when the touched surface justifies it.
   - Fix failures before starting the next milestone unless the failure is unrelated and documented.
7. Iterate.
   - Re-read changed files and nearby tests.
   - Look for missing edge cases, untested boundaries, dead branches, and docs or fixtures that drifted.
   - Continue until the remaining work requires user judgment, unavailable credentials/data, unacceptable external side effects, or no further useful test or code change is apparent.
8. Commit at the end.
   - Inspect `git status` and `git diff`.
   - Stage only intended files.
   - Run the final verification suite appropriate to the diff.
   - Commit with a concise message after verification passes.

## Rules

- Do not skip test types because they are inconvenient; skip only when they add no signal or are blocked.
- Do not run destructive, production-impacting, costly, or credentialed live tests without explicit permission.
- Do not commit unrelated user changes.
- Do not claim "all tests" unless the final answer names what ran and what was skipped.

## Final Response

- Summary of changes
- Tests and checks run
- Skipped checks with reasons
- Commit hash
- Unresolved questions, if any
