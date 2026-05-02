You are the patcher in an iterative plan review and patch workflow.

Target file: /Users/roy/Downloads/data-plan.md
Working directory: /Users/roy/Documents/quant

Policy: Edit only the target plan file. Do not edit any other file.

Patch the plan file end to end with all above suggested recommendations, so that all issues identified above are resolved. Take your time, and fix any more issues found during this pass. Re-read the plan in the end and do a formal review again. Do more research if needed.

Preserve the plan's original intent. Avoid broad rewrites unless needed to fix the finding. If you reject a finding, include a concrete rationale in the final JSON. Do not commit, stage, push, open PRs, or run destructive git commands.

Validation repair context:

No prior validation failure.

Full review response:

```text
**Findings**

1. **High: Deprecation is sequenced too early for the current architecture.**  
   The plan says production orchestration must stop shelling out to old public CLIs and then require `--allow-manual-data-step` for those same CLIs ([data-plan.md](/Users/roy/Downloads/data-plan.md:24), [data-plan.md](/Users/roy/Downloads/data-plan.md:61)). Today, `quant-build-production-dataset` is exactly a subprocess command list calling those public entrypoints ([cli_build_production_dataset.py](/Users/roy/Documents/quant/src/quantresearch/cli/cli_build_production_dataset.py:71), [cli_build_production_dataset.py](/Users/roy/Documents/quant/src/quantresearch/cli/cli_build_production_dataset.py:178)). If guards land before internal step APIs are fully wired, the canonical command can break itself. Sequence this explicitly: first extract shared callable step APIs, then move production orchestration to them, then add direct-CLI guards.

2. **High: ML-ready boundary is under-specified and can produce incomplete labels.**  
   The plan says build/gate ML-ready when “monthly signal plus next rebalance-day data exists” ([data-plan.md](/Users/roy/Downloads/data-plan.md:23)). Current labels use `next_entry_open`/`next_rebalance_date` as the label exit horizon ([labels.py](/Users/roy/Documents/quant/src/quantresearch/preprocessing/labels.py:13), [labels.py](/Users/roy/Documents/quant/src/quantresearch/preprocessing/labels.py:67)), and rows with missing exit price are excluded ([labels.py](/Users/roy/Documents/quant/src/quantresearch/preprocessing/labels.py:107)). For a newly completed month-end, having the next rebalance entry date is not necessarily enough to label that month’s return; the exit boundary may require the following month’s rebalance. Split this into `feature_snapshot_end`, `entry_data_end`, and `label_complete_through`, and decide whether the latest month is prediction-only or excluded from gated training labels.

3. **High: Freshness probing is correct in intent but too broad and ambiguous.**  
   The plan requires daily, daily_basic, moneyflow, limits, ETF daily, fund_adj, fund_nav, benchmark, and all configured non-Level-2 families to be fresh before live steps run ([data-plan.md](/Users/roy/Downloads/data-plan.md:58)). Current `quant-validate-tushare` only checks `stock_basic` access and all-A-share counts ([cli_validate_tushare.py](/Users/roy/Documents/quant/src/quantresearch/cli/cli_validate_tushare.py:12)). Define endpoint-specific requiredness, expected lag, retry/backoff, and whether each stale family blocks `daily-refresh`, `monthly-refresh`, or only `full-refresh`. Otherwise slower or lower-priority non-L2 endpoints can make daily execution refresh flaky.

4. **Medium: `--skip-gdelt-doc-api` conflicts with current default behavior.**  
   The plan frames GDELT DOC API as part of default macro/events with a skip flag ([data-plan.md](/Users/roy/Downloads/data-plan.md:14), [data-plan.md](/Users/roy/Downloads/data-plan.md:21)). Current macro builder defaults GDELT DOC API off and only fetches it with `--enable-gdelt-doc-api` ([cli_build_macro_event_layer.py](/Users/roy/Documents/quant/src/quantresearch/cli/cli_build_macro_event_layer.py:20), [cli_build_macro_event_layer.py](/Users/roy/Documents/quant/src/quantresearch/cli/cli_build_macro_event_layer.py:45)). Keep DOC API opt-in, or restrict default fetching to `full-refresh`; otherwise the daily canonical path adds avoidable network latency and external-service fragility.

5. **Medium: Official industry source discovery should not run by default on every daily refresh.**  
   The plan includes official industry manifest discovery/build in the unified dependency chain ([data-plan.md](/Users/roy/Downloads/data-plan.md:20)). The current command discovers and downloads public PDF sources, then writes source files and manifests under `sources/` ([cli_build_official_industry_manifest.py](/Users/roy/Documents/quant/src/quantresearch/cli/cli_build_official_industry_manifest.py:55), [cli_build_official_industry_manifest.py](/Users/roy/Documents/quant/src/quantresearch/cli/cli_build_official_industry_manifest.py:64)). That is a mutable external fetch, not a cheap deterministic daily step. Default should reuse a pinned manifest unless coverage/staleness checks prove discovery is required.

6. **Medium: Manual bypass policy needs a concrete per-CLI contract.**  
   The plan says bypass runs must use “real arguments” and not stale defaults ([data-plan.md](/Users/roy/Downloads/data-plan.md:81)), but many builder CLIs currently encode production-sensitive defaults, such as ML dataset inputs ([cli_build_ml_dataset.py](/Users/roy/Documents/quant/src/quantresearch/cli/cli_build_ml_dataset.py:35)), execution-ready inputs ([cli_build_execution_ready_dataset.py](/Users/roy/Documents/quant/src/quantresearch/cli/cli_build_execution_ready_dataset.py:76)), and fundamental feature dates ([cli_build_fundamental_features.py](/Users/roy/Documents/quant/src/quantresearch/cli/cli_build_fundamental_features.py:13)). Add a central helper that declares required explicit args per CLI under `--allow-manual-data-step`, then test each wrapper.

7. **Low: The “only default public refresh command” list has gaps.**  
   The deprecation list covers many refresh/build CLIs, but `quant-import-benchmark-constituents` remains an installed data-writing entrypoint ([pyproject.toml](/Users/roy/Documents/quant/pyproject.toml:49)) and can affect benchmark artifacts. If manual official imports are intentionally allowed, state that they are not refresh commands; otherwise include them in the manual-step policy.

8. **Info: The 2026-05-02 date fixture is valid.**  
   I checked the official SSE Labor Day notice. SSE states May 1 to May 5, 2026 are closed and normal opening resumes May 6, so resolving Saturday May 2, 2026 back to April 30, 2026 is consistent with the exchange notice: https://www.sse.com.cn/disclosure/announcement/general/c/c_20260423_10816345.shtml.

**Overall**

The plan is directionally sound and addresses real local issues: the current production command still has fixed `20260424` defaults and shells out to public CLIs. The highest-risk parts are sequencing, ML label completeness, and broad live freshness gates. I would implement this as staged work: context/date resolver plus dry-run schema first, internal step API migration second, then deprecation guards and checkpoint/resume after the unified command is self-contained.

Verification: read-only review; no files edited and no tests run.
```

Current plan text:

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

For internal CLI control, return only JSON matching the provided schema. Put the human-readable patch response in `markdown_response`; the CLI will print that text and keep the JSON as a hidden artifact.
