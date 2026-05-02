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
  - optional `--end-date`; omitted resolves to the latest completed SSE open day using Asia/Shanghai time, the SSE trading calendar, and an after-close cutoff
  - generated labels and all derived paths come from a single `RefreshContext`, with no hardcoded `20260424` orchestration paths or downstream builder defaults
  - `--dry-run` emits the full step plan, resolved dates, labels, explicit input/output paths, input hashes when files already exist, skip reasons, and checkpoint reuse decisions
  - `--strict-full` fails if ML-ready cannot be completed
  - `--mode daily-refresh|monthly-refresh|full-refresh` makes operator intent explicit while keeping one public entrypoint
  - `--skip-baostock` reuses existing audited BaoStock/patch artifacts only; it fails if required active-identity artifacts are absent and records freshness/status
  - `--skip-gdelt-doc-api` skips slower GDELT document diagnostics only, while recording skipped status and any reused macro/event inputs
- Orchestrate all non-Level-2 families in dependency order:
  - Tushare validation, endpoint freshness probes, and latest-date resolution
  - stock master/BaoStock/sentinels
  - daily A-share store, ETF universe/store/reference
  - benchmark constituents/returns
  - fundamentals, PIT fundamentals, official industry manifest discovery/build, PIT industry, non-L2 reference
  - regimes, macro/events with GDELT diagnostics, noise layer
  - execution-ready build/gate
  - ML-ready build/gate only when monthly signal plus next rebalance-day data exists
- Add a shared internal orchestration layer so the unified command does not shell out to deprecated public CLIs. Old CLI modules can call the shared step functions only after an explicit bypass flag.
- Add checkpoint/resume semantics before broad deprecation lands:
  - stable step IDs
  - started/completed timestamps
  - normalized inputs, input hashes, output paths, and output hashes
  - `rebuilt`, `reused_existing`, `skipped`, `stale`, `failed`, and `gated` statuses
  - resume decisions based on matching context labels, paths, hashes, and step versions

## Refresh Context
- Introduce one immutable `RefreshContext` created by `quant-build-production-dataset` before any step runs:
  - `start_date`
  - `requested_end_date`
  - `daily_end_date`
  - `monthly_signal_end`
  - `latest_rebalance_data_date`
  - generated label set for daily, monthly, execution-ready, ML-ready, benchmark, ETF proxy, regime, macro/event, PIT fundamentals, PIT industry, and non-L2 reference artifacts
  - all derived input/output paths for every builder and gate
  - command mode, skip flags, bypass policy, and checkpoint location
- Every orchestrated step must receive explicit context paths and labels. No step may rely on its standalone CLI defaults for production orchestration.
- Manifest output must record the actual input paths, input hashes, output paths, output hashes, generated labels, source date coverage, source staleness, and whether each artifact was rebuilt or reused.
- Production manifests and tests must verify recorded paths and hashes use the generated label for the requested refresh, not stale defaults from `20260424` or any other prior run.

## Date Resolution and Freshness
- Date resolution uses Asia/Shanghai local date/time and the SSE official trading calendar.
- If `--end-date` is omitted:
  - before the configured market-data completion cutoff, use the latest completed SSE open day strictly before today
  - after the cutoff, use today only if today is an SSE open day and required endpoint freshness probes confirm complete data
  - on weekends and SSE holidays, snap backward to the prior completed SSE open day
- If `--end-date` is provided:
  - preserve it as `requested_end_date`
  - set `daily_end_date` to that date only when it is an open day with complete endpoint freshness
  - otherwise snap `daily_end_date` backward to the prior completed open day and record `requested_end_date_status=closed_or_incomplete`
  - fail only when `--strict-full` or an explicit future date requires data that cannot be available
- The resolver must include a fixture where `today=2026-05-02` resolves `daily_end_date=20260430`, because SSE lists Labor Day closure from May 1 through May 5, 2026 and reopening on May 6.
- Extend Tushare validation beyond stock-basic access. Freshness probes must cover daily, daily_basic, moneyflow, limit data, ETF daily, fund adjustment, fund NAV, benchmark data, and configured non-Level-2 families before the context is allowed to run live steps.

## Legacy CLI Deprecation
- Deprecate direct data-refresh/build entrypoints by requiring `--allow-manual-data-step` when run directly:
  - `quant-build-monthly-history`, `quant-build-universe-history`, `quant-build-etf-universe`
  - `quant-backfill-store`, `quant-backfill-etf-store`, `quant-backfill-etf-reference`
  - `quant-backfill-fundamentals`, `quant-backfill-non-l2-reference`
  - `quant-backfill-benchmark-constituents`, `quant-backfill-benchmark-returns`
  - `quant-build-etf-proxy-returns`, `quant-build-regime-tags`, `quant-build-macro-event-layer`
  - `quant-build-noise-layer`, `quant-build-ml-dataset`, `quant-build-fundamental-features`
  - `quant-build-pit-industry`, `quant-build-official-industry-manifest`
  - `quant-build-baostock-reference`, `quant-build-baostock-sentinels`
  - `quant-build-execution-ready-dataset`
- Keep validation/gate commands active and not deprecated:
  - `quant-validate-tushare`
  - `quant-validate-store`
  - `quant-gate-ml-dataset`
  - `quant-gate-execution-ready-dataset`
- Direct deprecated CLIs should fail fast with:
  - replacement command: `uv run quant-build-production-dataset`
  - escape hatch: rerun with `--allow-manual-data-step`
  - clear note that manual runs are for troubleshooting, diagnostics, or isolated reruns only
- `quant-build-execution-ready-dataset` is a builder, so it is internal/orchestrator-only by default and requires `--allow-manual-data-step` when invoked directly. `quant-gate-execution-ready-dataset` remains unrestricted.
- Manual bypass runs must preserve current standalone behavior only when real arguments are provided explicitly. Bypass mode must not silently use stale production defaults.
- `quant-build-official-industry-manifest` is part of the unified orchestration because PIT industry consumes its source manifest. If an operator bypass reuses an existing manifest, output JSON must record manifest path, source period coverage, source staleness, and reuse status.
- Update `AGENTS.md`, `docs/60_deprecation_inventory.md`, and current preprocessing docs so the unified command is the only documented default route.

## Public Interface
```bash
uv run quant-build-production-dataset
uv run quant-build-production-dataset --end-date 20260430
uv run quant-build-production-dataset --dry-run
uv run quant-build-production-dataset --strict-full
uv run quant-build-production-dataset --mode daily-refresh
uv run quant-build-production-dataset --mode monthly-refresh
uv run quant-build-production-dataset --mode full-refresh
uv run quant-build-production-dataset --skip-baostock
uv run quant-build-production-dataset --skip-gdelt-doc-api
```

Output JSON includes `requested_end_date`, `daily_end_date`, `requested_end_date_status`, `monthly_signal_end`, `monthly_boundary_status`, command mode, generated labels/paths, per-step statuses, checkpoint decisions, skipped/reused/stale/failed/gated states, execution-ready gate status, and ML-ready status.

For `--skip-baostock`, output JSON must still include the active stock-universe identity source, patched master path, audited patch source path, sentinel status, freshness, and whether the required artifacts were reused.

## Test Plan
- Dry-run tests:
  - generated plan contains no stale `20260424` paths for a new end date
  - all non-Level-2 data families appear by default
  - generated plan includes official industry manifest build/discovery before PIT industry
  - generated plan includes explicit generated inputs for production constants, ML dataset, execution-ready, ETF proxy, macro regimes, benchmark, labels, and gates
  - ML-ready is skipped with a clear reason when monthly boundary is incomplete
  - dry-run fixture covers a month-end-complete date
  - dry-run fixture covers an incomplete monthly boundary
- Deprecation tests:
  - each deprecated direct CLI exits nonzero without `--allow-manual-data-step`
  - deprecated direct CLIs run their existing behavior with the bypass flag
  - `quant-build-execution-ready-dataset` requires `--allow-manual-data-step` when run directly
  - bypass runs require explicit real arguments for production-sensitive paths and do not fall back to stale defaults
  - gate/validation commands remain callable without bypass
- Resolver and behavior tests:
  - holiday/weekend resolves to prior completed open day
  - `today=2026-05-02` resolves `daily_end_date=20260430`
  - explicit closed `--end-date` preserves `requested_end_date`, snaps `daily_end_date` backward, and records the closed/incomplete status
  - endpoint freshness probes block live execution when daily, daily_basic, moneyflow, limits, ETF daily, fund_adj, fund_nav, benchmark, or non-Level-2 families are stale
  - `--strict-full` fails when ML-ready would be skipped
  - daily-first mode can succeed with execution-ready gated and ML skipped
- Integration tests:
  - production orchestration uses an internal API with stubbed steps instead of `uv run` subprocess command lists
  - no deprecated console script names appear in the production execution path
  - every step receives explicit paths from `RefreshContext`
  - output schema distinguishes `skipped`, `reused_existing`, `stale`, `failed`, and `gated`
  - partial daily-first success records execution-ready success and ML-ready skip without marking the full run failed
  - manifest tests assert recorded input paths and hashes match the generated refresh label
  - checkpoint/resume tests reuse only when step IDs, labels, paths, hashes, and step versions match
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
