You are an independent stop-checker for an iterative plan review and patch workflow.

Target file: /Users/roy/Downloads/data-plan.md
Working directory: /Users/roy/Documents/quant

Decide only whether actionable review findings remain. Do not perform a full review. Do not edit files.

If validation context contains a failed command, treat that as an actionable finding unless the plan text clearly resolves it.

Validation context:

```text
None.
```

Latest review:

```text
**Findings**

1. **High: Execution-ready build remains a bypass path**
   The plan says `quant-build-production-dataset` becomes the single canonical refresh entrypoint, but explicitly keeps `quant-build-execution-ready-dataset` active without a bypass flag. That command is a build command, not just validation, and its current defaults still point at `a_share_all_v1_full_20260424` and `20080101_20260424_full`. This leaves a direct stale artifact path outside the unified refresh.
   Recommendation: either deprecate `quant-build-execution-ready-dataset` behind `--allow-manual-data-step`, or make it an internal/diagnostic command requiring explicit input paths and output label. Keep only `quant-gate-execution-ready-dataset` freely callable.

2. **High: Default live refresh is a major behavior change and needs cache/rate-limit semantics**
   Current project guidance treats full live refresh as intentional, and raw-store refresh only when a gap is proven. The plan flips default `quant-build-production-dataset` into a live Tushare/BaoStock/GDELT refresh across all non-Level-2 families. That can consume quotas, fail on network/vendor availability, and make normal preprocessing nondeterministic. Current macro GDELT is opt-in via `--enable-gdelt-doc-api`; the plan makes `--skip-gdelt-doc-api` the opt-out.
   Recommendation: define default as cache-first plus freshness checks, with explicit `--refresh-*` modes for live fetches. Add `--prefer-cache`/resume checkpoints for BaoStock, rate-limit controls, and step-level skip reasons for already-current artifacts.

3. **High: Latest-date resolver is underspecified for partial trading days and monthly ML eligibility**
   “Latest completed SSE open day <= today” is not enough. On an SSE trading day before post-close vendor data is complete, resolving to today can fetch partial or empty data. Monthly ML eligibility also depends on the month-end signal date and the next rebalance-day data. Existing monthly schedule logic requires a next open day after month-end; daily backfill only covers open days through its own `end_date`.
   Recommendation: make the resolver return separate `requested_end_date`, `daily_end_date`, `monthly_signal_date`, `monthly_rebalance_date`, and `ml_eligible`. Define Asia/Shanghai cutoff time, vendor-lag policy, and exact behavior when next rebalance data is unavailable. Test trading day before close, after close, weekend/holiday, month-end, and post-month-end rebalance availability.

4. **High: Label generation risks breaking downstream defaults**
   The plan says labels are generated from `START/END`, but the repo has many downstream defaults and constants tied to `a_share_all_v1_full_20260424` and related `20080101_20260424` paths, including production, execution-ready, factor registry, tournament, feature views, docs, and tests. A new label scheme will leave commands reading stale artifacts unless the migration is explicit.
   Recommendation: centralize label/path derivation and migrate downstream defaults deliberately. Preserve the existing semantic prefix, e.g. `a_share_all_v1_full_{effective_end}`, unless there is a reason to include start date. Add tests that the dry-run plan and generated defaults do not mix new labels with stale `20260424` orchestration paths.

5. **Medium: Deprecated CLI classification is incomplete**
   The deprecation list covers many refresh/build CLIs, but the repo also exposes related scripts such as `quant-import-benchmark-constituents`, `quant-build-official-industry-manifest`, `quant-confirm-stock-basic-patches`, and already-deprecated `quant-build-event-layer`. These may or may not need deprecation, but the plan does not classify them, so bypass routes can remain by omission.
   Recommendation: create an explicit classification table for every `[project.scripts]` entry: canonical, gate/validation, audit-only, manual-data-step, historical-deprecated, research-bypass, or unaffected. Add a test that compares `pyproject.toml` script names to that classification.

6. **Medium: The shared orchestration layer needs a concrete contract**
   Current `cli_build_production_dataset.py` shells out with `subprocess.run`, while the individual CLIs are mostly argparse wrappers around live IO. The plan says to add shared step functions but does not define their interface, idempotency, dry-run behavior, or how direct CLI bypass guards avoid blocking internal orchestration.
   Recommendation: define a small step contract: inputs, outputs, dependencies, `dry_run`, `status`, `skip_reason`, `artifact_paths`, timings, and exception policy. Add tests proving production orchestration does not call public console scripts/subprocess, while direct deprecated CLIs fail before token loading unless `--allow-manual-data-step` is present.

7. **Medium: Dependency order is too coarse for implementation**
   Several planned steps depend on artifacts not named in the sequence. For example, daily store currently needs monthly-universe/history inputs for some modes; BaoStock sentinels also default to monthly universe and benchmark constituents; ML-ready consumes benchmark returns, ETF proxy returns, observation quality, events, PIT industry, and fundamental features. The plan lists families, but not the actual artifact DAG.
   Recommendation: turn the step list into a DAG with concrete paths and labels per step. Dry-run should expose that DAG, not just a flat command list.

8. **Medium: Public interface does not handle existing flag migration**
   Existing documented usage includes `--refresh-monthly`, `--refresh-raw-store`, `--start-date`, `--output-label`, `--scope-name`, and `--skip-fundamentals`. The new public interface lists only `--end-date`, `--dry-run`, `--strict-full`, `--skip-baostock`, and `--skip-gdelt-doc-api`. Silent removal would break current docs and scripts.
   Recommendation: explicitly state which flags remain, which become aliases, and which are removed. Prefer keeping backwards-compatible aliases with deprecation warnings for at least one pass.

9. **Low: Test plan should cover stale-path and no-subprocess regressions more directly**
   The test plan has good categories, but it should include checks that generated execution-ready, benchmark, ETF, regime, macro, noise, and ML paths are all derived from the same resolved context. It should also include a regression test that production orchestration cannot invoke deprecated public CLIs.
   Recommendation: add tests over the dry-run JSON schema and step DAG, plus a monkeypatched no-subprocess test.

**Overall**

The plan is directionally useful, but I would not approve it as execution-ready yet. The largest correction is to separate “canonical orchestration” from “always live refresh,” then lock down resolver semantics and bypass classification before implementation. No external research was necessary; local repo context was sufficient for this review.
```

Current plan:

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

Return only JSON matching the provided schema.
