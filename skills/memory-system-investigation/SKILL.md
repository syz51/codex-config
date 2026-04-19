---
name: memory-system-investigation
description: Investigate regressions, quality issues, and truth drift anywhere in the memory-system knowledge workflow. Use when Codex needs to do deep root-cause analysis or end-to-end auditing of ingest, source records, enrichment, planner/reviewer behavior, draft compilation, approval gates, published artifacts, index coverage, CLI lifecycle, or verification failures in the memory system. Trigger for requests to investigate “why did this run behave like this,” “audit the published artifacts,” “rerun the source and find what is wrong,” “trace the defect through the workflow,” “discover anything wrong through this framework,” or “do an end-to-end KB investigation and fix what you can.”
---

# Memory System Investigation

Build a compact working brief before changing code:

- User-visible symptom
- Latest known run or artifact id
- Expected behavior
- Observed behavior
- Suspected layers
- Acceptance bar

Treat the workflow as a pipeline, not one bug. The point is to discover where truth drift enters, not to overfit to the first visible defect. Recent defects are useful examples, not the boundary of the investigation.

## Investigation Modes

Choose one primary mode, then expand only if evidence crosses layers. These modes are starting points, not scope constraints.

`artifact-audit`
- Use when the user says the published pages, source record, or approved output look wrong.
- Start from current approved artifacts and walk backward.

`run-regression`
- Use when the user references the latest run or asks to replay a source end to end.
- Reproduce, inspect draft/workflow artifacts, then patch and rerun.

`contract-leak`
- Use when data crosses layers incorrectly.
- Examples: support-layer material leaking into approved pages, workflow chatter in durable knowledge, path/layout mismatches, malformed frontmatter, or verification using the wrong file class.

`coverage-drift`
- Use when the system technically succeeds but under-covers or mis-splits the source.
- Compare source-record topic clusters against approved page scope and index coverage gaps.

## Layer Map

Classify findings by layer. Do not blur them.

`raw/archive`
- Immutable source input.
- Questions here are about extraction quality, transcript integrity, missing sections, OCR issues, sponsor/ad contamination, or path resolution.

`source-record`
- Support layer only.
- It should preserve useful source data and bounded extracts.
- It should not pass validation chatter, approval reasoning, or meta-judgments downstream as if they were source facts.

`planner/reviewer/operator`
- Proposal and decision layer.
- Questions here are about page splitting, skipped topics, overlap, unsupported synthesis, weak objections, or missing revision pressure.

`bundle compiler / draft materialization`
- Structural layer.
- Questions here are about relative paths, page keys, related pages, section defaults, malformed frontmatter, or auto-injected content that does not belong.

`published/current`
- Query-visible approved layer.
- Questions here are about page scope, provenance, cross-links, duplicate/fragmented coverage, index visibility, and durable readability.

`cli / lifecycle / verification`
- Runtime layer.
- Questions here are about hangs, silent success, verification blind spots, stale process state, or mismatches between workflow completion and CLI exit behavior.

## Standard Workflow

### 1. Reproduce or Capture

Prefer a real replay when the user asks for latest-run analysis or when the failure may be stateful.

Capture:

- command used
- exact source / artifact id
- latest draft id
- workflow-state path
- source record path
- published artifact paths

If the live CLI hangs but workflow artifacts reach a terminal state, treat that as a separate lifecycle bug. Do not confuse it with the semantic output defect.

### 2. Inspect the Evidence Ladder

Inspect in this order unless a blocker forces a different path:

1. current approved artifacts
2. current source record
3. latest draft `workflow-state.json`
4. proposed files under `review/drafts/<draft>/proposed/`
5. planner / reviewer / planner-response / operator JSON artifacts
6. ingest or persist logs
7. raw archive text around the disputed topic

This order keeps the investigation grounded in what actually shipped before diving into internals.

### 3. Ask the Right Question Per Layer

Use concrete questions, not generic “what is wrong?” scanning.

For source records:

- Is the extract about actual source content, or did meta-reasoning leak in?
- Are substantive later sections preserved, or did extraction truncate too early?
- Are headings/topic buckets faithful to the source, or are they mislabeled?
- Is deterministic support good enough that a model pass should be skipped?

For planner/reviewer behavior:

- Did the planner see the important topic clusters?
- Did it update an existing page when it should have created a new one, or vice versa?
- Were deferred topics explicitly justified?
- Did the reviewer push back on under-coverage, over-claiming, or workflow chatter?

For compiler/published artifacts:

- Are approved pages in the correct durable path and linked consistently?
- Were `related_pages`, section bodies, or aliases dropped or overwritten?
- Did malformed frontmatter or auto-generated notes corrupt published readability?
- Did the index reflect the same page set and coverage posture as the approved pages?

### 4. Look for Cross-Layer Mismatches

These are common high-value failure modes:

- Source record contains richer content than the approved bundle uses.
- Planner proposal says one thing, but compiled draft materializes something else.
- Published markdown differs from the reviewed draft due to compiler normalization.
- Deterministic verification passes because it is looking at the wrong path class.
- Approved pages contain workflow/process narration instead of durable semantic history.
- Index or related-page links point to the wrong directory or stale page identity.

### 5. Patch Narrowly, Then Re-Run

Fix the highest-leverage layer first.

Typical order:

1. structural contract bugs
2. extraction / source-support bugs
3. planner / reviewer prompt pressure
4. CLI / lifecycle cleanup

After each milestone, rerun the lightest meaningful verification first:

- focused tests for the changed layer
- then the relevant workflow replay
- then full repo verification if the change altered shared behavior

## Mandatory Audits

Run these even if the user only points at one symptom. They are meant to widen the investigation, not to force a narrow prior bug model.

### Durable Artifact Audit

Review:

- source record
- approved knowledge pages
- approved index pages
- latest draft proposed files

Check for:

- workflow chatter in durable pages
- malformed YAML/frontmatter
- incorrect page scope
- missing reciprocal links
- index/page disagreement
- duplicated or silently deferred topic clusters

### Coverage Audit

Compare substantive source-record extract headings against:

- approved page set
- index canonical pages
- index coverage gaps
- planner `skippedTopics`

If the source record surfaces several distinct clusters and approved knowledge still has only one substantive page, require an explicit reason for each deferred cluster.

### Support-Layer Audit

Check that support material stays support material.

Reject patterns like:

- validation commentary phrased as source content
- reviewer/operator reasoning copied into source records
- “valid/invalid” judgments passed downstream instead of the underlying data

The source record should support the rest of the system by preserving information, not by editorializing about tool validity.

## Recommended Commands

Use the lightest commands that expose the evidence.

Repo-wide contract search:

```bash
rg -n "published/current/wiki|published/current/knowledge|review/workbench/wiki|review/workbench/knowledge|related_pages|source_refs" .
```

Focused verification:

```bash
bun test tests/source-enricher.test.ts tests/workflow-gates.test.ts tests/autonomous-workflow.test.ts tests/cli.test.ts
bunx tsc --noEmit
bun run lint
bun run memory-system lint --kb <kb> --json
```

End-to-end replay:

```bash
MEMORY_SYSTEM_PROGRESS=1 bun run memory-system ingest "<file>" --kb <kb> --source-url '<url>' --enrich auto --json
```

Inspect latest workflow artifacts:

```bash
find knowledge_bases/<kb>/review/drafts/<draft-id>/proposed -type f | sort
cat knowledge_bases/<kb>/review/drafts/<draft-id>/workflow-state.json
```

Inspect raw archive around disputed themes:

```bash
rg -n "keyword1|keyword2|keyword3" "knowledge_bases/<kb>/data/raw/archive/<artifact-id>/<file>"
```

## Decision Rules

- Prefer proving the bug with artifacts before changing prompts.
- Treat path/layout bugs as compiler/runtime defects, not content-policy defects.
- Treat under-coverage as a planner/reviewer problem only after confirming the source record actually carries the missing support.
- If approved output is wrong but the source record is right, push investigation forward into planning/compile/apply.
- If approved output and source record are both wrong, start at extraction/enrichment.
- If the workflow artifacts show `approved` but the shell command never returns, log a separate CLI teardown issue.

## Output Expectations

When reporting findings, separate:

1. confirmed root causes
2. fixed issues
3. remaining risks
4. what still needs another iteration

Do not present a conservative workaround as if it solved the product question. If the system is still under-splitting, say so explicitly even if the artifacts are cleaner than before.

When this skill is used with a user request for a deep replay, pair it with `[$e2e](/Users/roy/.codex/skills/e2e/SKILL.md)` if that skill is available. When the task is mainly evidence triage or root-cause narrowing, pair it with `[$analyze](/Users/roy/.codex/skills/analyze/SKILL.md)` if available.
