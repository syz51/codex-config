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

1. **High: execution-ready builder remains a bypass despite the single-entrypoint goal**
The plan says `quant-build-production-dataset` should be the single canonical refresh entrypoint, but it explicitly keeps `quant-build-execution-ready-dataset` callable without a bypass. That command is a builder, not just a gate, and it currently writes execution-ready artifacts directly with hardcoded 20260424-era defaults. This preserves exactly the class of direct build bypass the plan is trying to remove. Evidence: plan lines 24-38 in [/Users/roy/Downloads/data-plan.md](/Users/roy/Downloads/data-plan.md:24), script registration in [pyproject.toml](/Users/roy/Documents/quant/pyproject.toml:57), and execution-ready defaults in [cli_build_execution_ready_dataset.py](/Users/roy/Documents/quant/src/quantresearch/cli/cli_build_execution_ready_dataset.py:75).

Recommendation: make `quant-build-execution-ready-dataset` either internal/orchestrator-only or require `--allow-manual-data-step`, while keeping only `quant-gate-execution-ready-dataset` unrestricted. If manual execution-ready rebuilds are intended to remain first-class, the plan should stop claiming one refresh entrypoint.

2. **High: generated labels are under-scoped; many downstream defaults will still mix stale 20260424 inputs**
The plan correctly calls out generated labels and no hardcoded `20260424` orchestration paths, but the codebase has hardcoded 20260424 defaults across production constants, ML dataset inputs, execution-ready inputs, ETF proxy inputs, macro regimes, and benchmark references. A dry-run test that only checks the production command plan is not enough, because a downstream builder can still default to old benchmark, ETF, regime, or label artifacts if one argument is missed. Evidence: production constants in [production.py](/Users/roy/Documents/quant/src/quantresearch/preprocessing/production.py:12), production CLI defaults and regime paths in [cli_build_production_dataset.py](/Users/roy/Documents/quant/src/quantresearch/cli/cli_build_production_dataset.py:42), ML defaults in [cli_build_ml_dataset.py](/Users/roy/Documents/quant/src/quantresearch/cli/cli_build_ml_dataset.py:35), execution-ready defaults in [cli_build_execution_ready_dataset.py](/Users/roy/Documents/quant/src/quantresearch/cli/cli_build_execution_ready_dataset.py:76), and ETF proxy defaults in [cli_build_etf_proxy_returns.py](/Users/roy/Documents/quant/src/quantresearch/cli/cli_build_etf_proxy_returns.py:31).

Recommendation: define one `RefreshContext` with `start_date`, `requested_end_date`, `daily_end_date`, `monthly_signal_end`, labels, and all derived paths. Every step should take explicit paths from that context. Add manifest tests that assert actual recorded input paths and hashes match the generated label, not just that dry-run text lacks `20260424`.

3. **High: latest completed trading-day behavior is not precise enough for live use**
The plan says omitted `--end-date` resolves to the latest completed SSE open day, and shows `--end-date 20260501`. Official SSE 2026 holiday guidance lists Labor Day closure from May 1 to May 5, reopening May 6, so on the current date May 2, 2026 the latest completed SSE open day should be April 30, 2026, not May 1. The plan also does not specify whether an explicit closed `--end-date` should fail, snap backward, or remain `requested_end_date` while `daily_end_date` snaps backward. Evidence: plan lines 7-12 and 45-55 in [/Users/roy/Downloads/data-plan.md](/Users/roy/Downloads/data-plan.md:7); current `quant-validate-tushare` only validates stock-basic access, not calendar or endpoint freshness, in [cli_validate_tushare.py](/Users/roy/Documents/quant/src/quantresearch/cli/cli_validate_tushare.py:9). External source used: official SSE 2026 closure page: https://www.sse.com.cn/disclosure/dealinstruc/closed/.

Recommendation: specify resolver semantics exactly: timezone, after-close cutoff, holiday/weekend snapping, explicit closed-date behavior, and Tushare endpoint freshness probes for daily, daily_basic, moneyflow, limits, ETF daily, fund_adj, fund_nav, benchmark, and non-L2 families. Include a test where `today=2026-05-02` resolves `daily_end_date=20260430`.

4. **Medium: PIT industry orchestration is incomplete because the official industry manifest builder is omitted**
The plan includes PIT industry in the unified refresh and deprecates `quant-build-pit-industry`, but it does not mention `quant-build-official-industry-manifest`, which discovers/downloads the official CAPCO/CSRC source manifest consumed by PIT industry. That leaves a direct data acquisition command outside the deprecation list and creates ambiguity over whether the unified path refreshes industry sources or reuses an existing manifest. Evidence: script registration in [pyproject.toml](/Users/roy/Documents/quant/pyproject.toml:67), and manifest output consumed by PIT industry in [cli_build_official_industry_manifest.py](/Users/roy/Documents/quant/src/quantresearch/cli/cli_build_official_industry_manifest.py:23).

Recommendation: either add official industry manifest build/discovery to the orchestration and deprecation policy, or explicitly mark it as a source-maintenance command that is not part of daily refresh. If reused, output JSON should record manifest path, source period coverage, and staleness.

5. **Medium: `--skip-baostock` is underspecified and can weaken the active identity contract**
Project policy says `stock_master_patched.parquet` is the active stock-universe identity source, and that artifact lives under BaoStock reference outputs. The plan adds `--skip-baostock`, but does not say whether it reuses the existing patched master, skips only vendor diagnostics, disables sentinel refresh, or permits building without cross-check evidence. Evidence: policy in [AGENTS.md](/Users/roy/Documents/quant/AGENTS.md:69), current stock-master default in [production.py](/Users/roy/Documents/quant/src/quantresearch/preprocessing/production.py:18), and production CLI stock-master override in [cli_build_production_dataset.py](/Users/roy/Documents/quant/src/quantresearch/cli/cli_build_production_dataset.py:45).

Recommendation: define `--skip-baostock` as “reuse existing audited BaoStock/patch artifacts only,” fail if required artifacts are absent, and emit explicit freshness/status fields. Do not let it silently build a new universe identity without the current patched master contract.

6. **Medium: test plan does not cover the most failure-prone integration surfaces**
The proposed tests cover dry-run, deprecation, resolver behavior, and quality gates, but miss important integration checks: production path must not shell out to deprecated public CLIs, production must pass explicit generated inputs to every step, manual bypass flags must preserve previous behavior with real arguments, and output JSON must distinguish skipped, reused, stale, failed, and gated statuses. Existing production code currently shells out through `uv run` command lists, so this is a real migration risk. Evidence: current subprocess orchestration in [cli_build_production_dataset.py](/Users/roy/Documents/quant/src/quantresearch/cli/cli_build_production_dataset.py:71) and public CLI script surface in [pyproject.toml](/Users/roy/Documents/quant/pyproject.toml:24).

Recommendation: add tests around an internal orchestrator API with stubbed steps, assert no deprecated console script names appear in the execution path, and validate the output schema for partial daily-first success. Add at least one end-to-end dry-run fixture for a month-end-complete date and one for an incomplete monthly boundary.

**Additional Optimizations**

The unified refresh will be expensive. Add checkpoint/resume semantics before broad deprecation lands: step IDs, input hashes, output hashes, started/completed timestamps, and `reused_existing` vs `rebuilt`. This would make `--dry-run` useful as a real execution contract and reduce failed full reruns.

Consider splitting command posture into `daily-refresh`, `monthly-refresh`, and `full-refresh` modes under the same public CLI instead of many negative skip flags. That keeps one entrypoint while making operator intent clearer than `--strict-full`, `--skip-baostock`, and `--skip-gdelt-doc-api` combinations.

**Sources Reviewed**

Local plan: [/Users/roy/Downloads/data-plan.md](/Users/roy/Downloads/data-plan.md:1)
Local context: [cli_build_production_dataset.py](/Users/roy/Documents/quant/src/quantresearch/cli/cli_build_production_dataset.py:39), [pyproject.toml](/Users/roy/Documents/quant/pyproject.toml:24), [production.py](/Users/roy/Documents/quant/src/quantresearch/preprocessing/production.py:12), [cli_build_execution_ready_dataset.py](/Users/roy/Documents/quant/src/quantresearch/cli/cli_build_execution_ready_dataset.py:75), [cli_build_ml_dataset.py](/Users/roy/Documents/quant/src/quantresearch/cli/cli_build_ml_dataset.py:35), [AGENTS.md](/Users/roy/Documents/quant/AGENTS.md:36)
External: SSE official 2026 closure page, https://www.sse.com.cn/disclosure/dealinstruc/closed/

Read-only review only; no files edited and no quality gates run because this was a plan review.
```

Current plan text:

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

For internal CLI control, return only JSON matching the provided schema. Put the human-readable patch response in `markdown_response`; the CLI will print that text and keep the JSON as a hidden artifact.
