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