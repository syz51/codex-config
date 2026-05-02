You are the reviewer in an iterative plan review and patch workflow.

Target file: /Users/roy/Downloads/data-plan.md
Working directory: /Users/roy/Documents/quant

Do a formal review of the plan file now. Identify any problems that might happen, any issues, and any optimizations that could be made. Do this end to end. Do more research if needed. Consider any area that is relevant to the plan.

Read the plan and inspect relevant local context before judging. Stay read-only. Do not edit files. Consider correctness, completeness, feasibility, clarity, sequencing, risks, missing assumptions, and possible simplifications or optimizations where relevant.

For internal CLI control, return only JSON matching the provided schema. Put the human-readable review in `markdown_response`; the CLI will print that text and keep the JSON as a hidden artifact.

Extra context:

None.

Plan text:

```markdown
# Unified Non-Level-2 Refresh With Legacy CLI Deprecation

## Summary
Refactor `quant-build-production-dataset` into the single canonical refresh entrypoint for all non-Level-2 data, and deprecate the old direct refresh/build CLIs that currently let users bypass the unified path. Default behavior remains **daily-first**: resolve the latest completed SSE trading day, refresh daily/reference data, build and gate execution-ready artifacts, and build/gate ML-ready only when the latest monthly boundary is complete.

## Key Changes
- Make `quant-build-production-dataset` the only default public refresh command:
  - optional `--end-date`; omitted resolves to latest completed SSE open day <= today
  - generated labels from `START/END`, with no hardcoded `20260424` orchestration paths
  - `--dry-run` emits the full step plan, resolved dates, labels, and skip reasons
  - `--strict-full` fails if ML-ready cannot be completed
  - `--skip-baostock` and `--skip-gdelt-doc-api` opt out of slower diagnostics
- Orchestrate all non-Level-2 families in dependency order:
  - Tushare validation and latest-date resolution
  - stock master/BaoStock/sentinels
  - daily A-share store, ETF universe/store/reference
  - benchmark constituents/returns
  - fundamentals, PIT fundamentals, PIT industry, non-L2 reference
  - regimes, macro/events with GDELT diagnostics, noise layer
  - execution-ready build/gate
  - ML-ready build/gate only when monthly signal plus next rebalance-day data exists
- Add a shared internal orchestration layer so the unified command does not shell out to deprecated public CLIs. Old CLI modules can call the shared step functions only after an explicit bypass flag.

## Legacy CLI Deprecation
- Deprecate direct data-refresh/build entrypoints by requiring `--allow-manual-data-step` when run directly:
  - `quant-build-monthly-history`, `quant-build-universe-history`, `quant-build-etf-universe`
  - `quant-backfill-store`, `quant-backfill-etf-store`, `quant-backfill-etf-reference`
  - `quant-backfill-fundamentals`, `quant-backfill-non-l2-reference`
  - `quant-backfill-benchmark-constituents`, `quant-backfill-benchmark-returns`
  - `quant-build-etf-proxy-returns`, `quant-build-regime-tags`, `quant-build-macro-event-layer`
  - `quant-build-noise-layer`, `quant-build-ml-dataset`, `quant-build-fundamental-features`
  - `quant-build-pit-industry`, `quant-build-baostock-reference`, `quant-build-baostock-sentinels`
- Keep validation/gate commands active and not deprecated:
  - `quant-validate-tushare`
  - `quant-validate-store`
  - `quant-gate-ml-dataset`
  - `quant-build-execution-ready-dataset`
  - `quant-gate-execution-ready-dataset`
- Direct deprecated CLIs should fail fast with:
  - replacement command: `uv run quant-build-production-dataset`
  - escape hatch: rerun with `--allow-manual-data-step`
  - clear note that manual runs are for troubleshooting, diagnostics, or isolated reruns only
- Update `AGENTS.md`, `docs/60_deprecation_inventory.md`, and current preprocessing docs so the unified command is the only documented default route.

## Public Interface
```bash
uv run quant-build-production-dataset
uv run quant-build-production-dataset --end-date 20260501
uv run quant-build-production-dataset --dry-run
uv run quant-build-production-dataset --strict-full
uv run quant-build-production-dataset --skip-baostock
uv run quant-build-production-dataset --skip-gdelt-doc-api
```

Output JSON includes resolved `daily_end_date`, `requested_end_date`, `monthly_boundary_status`, generated labels/paths, per-step statuses, execution-ready gate status, and ML-ready status.

## Test Plan
- Dry-run tests:
  - generated plan contains no stale `20260424` paths for a new end date
  - all non-Level-2 data families appear by default
  - ML-ready is skipped with a clear reason when monthly boundary is incomplete
- Deprecation tests:
  - each deprecated direct CLI exits nonzero without `--allow-manual-data-step`
  - deprecated direct CLIs run their existing behavior with the bypass flag
  - gate/validation commands remain callable without bypass
- Resolver and behavior tests:
  - holiday/weekend resolves to prior completed open day
  - `--strict-full` fails when ML-ready would be skipped
  - daily-first mode can succeed with execution-ready gated and ML skipped
- Quality gates:
  ```bash
  uv run ruff check src tests
  uv run ruff format --check src tests
  uv run pyright
  uv run bandit -c pyproject.toml -r src/quantresearch
  uv run --group test pytest -q
  ```

## Assumptions
- “Deprecate” means direct manual CLIs remain available only behind `--allow-manual-data-step`, not removed from `pyproject.toml`.
- `quant-build-production-dataset` remains the public command name.
- Level-2 remains excluded.
- Canonical research-run pointers are not updated automatically.
- Unresolved questions: none.

```
