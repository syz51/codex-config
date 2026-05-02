---
name: plan-review-iterator
description: Use this skill when the user wants to iteratively review and patch a plan file until no actionable review findings remain, using a local Bun CLI that drives separate Codex exec review, patch, clean-check, validation, resume, cleanup, and archive steps.
argument-hint: "[absolute plan file path]"
---

# Plan Review Iterator

Use the bundled Bun CLI. Do not simulate the loop manually.

## Commands

Run from this skill directory:

```bash
cd /Users/roy/.codex/skills/plan-review-iterator
```

For the standard iterative workflow:

```bash
bun run plan-iterate -- /absolute/path/to/plan.md
```

## Reporting

After running, report:

- run directory
- final clean status
- iterations used
- validation commands run
- unresolved questions, if any

Use `status --run /absolute/run/dir` to inspect an existing run, `resume --run /absolute/run/dir` to continue, and `cleanup` or `archive` for old artifacts.
