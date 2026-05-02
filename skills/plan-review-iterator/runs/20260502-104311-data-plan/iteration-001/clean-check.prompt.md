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

1. **High: Daily default may accidentally become a slow, flaky full non-L2 rebuild.**
The plan says the unified command should orchestrate all non-Level-2 families in dependency order and the dry-run should include all families by default ([data-plan.md](/Users/roy/Downloads/data-plan.md:15), [data-plan.md](/Users/roy/Downloads/data-plan.md:128)). In the current code, some of those families are heavy per-code or external-source jobs: non-L2 reference loops across all active stock codes and endpoint batches with sleeps ([non_l2_reference.py](/Users/roy/Documents/quant/src/quantresearch/data/non_l2_reference.py:318), [non_l2_reference.py](/Users/roy/Documents/quant/src/quantresearch/data/non_l2_reference.py:227)), and official industry discovery performs live CAPCO/CSRC downloads ([official_sources.py](/Users/roy/Documents/quant/src/quantresearch/preprocessing/official_sources.py:151)). This conflicts with the daily-first goal. Make the mode matrix explicit per family: `execute`, `probe`, `reuse_existing`, `skip_optional`, or `block_if_stale`. Default `daily-refresh` should execute only daily/execution-required inputs and reuse or mark slow monthly/full families.

2. **High: Execution-ready success is not cleanly decoupled from ML-ready skip.**
The plan allows daily-first success with execution-ready gated and ML-ready skipped ([data-plan.md](/Users/roy/Downloads/data-plan.md:153)), but the existing execution-ready builder still records `ml_ready_dir` as an input ([cli_build_execution_ready_dataset.py](/Users/roy/Documents/quant/src/quantresearch/cli/cli_build_execution_ready_dataset.py:76), [cli_build_execution_ready_dataset.py](/Users/roy/Documents/quant/src/quantresearch/cli/cli_build_execution_ready_dataset.py:131)) and declares its source boundary as `curated_daily_panels_plus_gated_monthly_ml_ready` ([execution_ready.py](/Users/roy/Documents/quant/src/quantresearch/preprocessing/execution_ready.py:461)). If the current ML label is skipped, the execution manifest can imply a gated ML dependency that does not exist. Either remove ML-ready from execution-ready inputs for daily execution, or record a separate `training_context_ml_ready_dir` that points to the last known gated ML artifact while the current label is `skipped`.

3. **High: Label completeness needs a stricter artifact boundary, not only row flags.**
The plan says incomplete latest-month labels should be prediction-only or excluded ([data-plan.md](/Users/roy/Downloads/data-plan.md:59)), but the current ML builder can still materialize rows with missing exit prices: `build_executable_labels` marks them `exclude_from_label` rather than dropping them ([labels.py](/Users/roy/Documents/quant/src/quantresearch/preprocessing/labels.py:68), [labels.py](/Users/roy/Documents/quant/src/quantresearch/preprocessing/labels.py:107)), and `assemble_ml_ready_dataset` builds splits from all base `signal_date` values ([ml_dataset.py](/Users/roy/Documents/quant/src/quantresearch/preprocessing/ml_dataset.py:445)). The ML gate checks artifacts, keys, hashes, and policy, but not label completeness by cutoff ([production.py](/Users/roy/Documents/quant/src/quantresearch/preprocessing/production.py:113)). Add a hard training cutoff before writing `features.parquet`, `labels.parquet`, and `splits.parquet`, plus a gate assertion that max training `signal_date <= ml_training_label_end`. Put prediction-only rows in a separate artifact or directory.

4. **Medium: Public interface breaks documented flags without a migration path.**
The plan introduces `--mode daily-refresh|monthly-refresh|full-refresh` ([data-plan.md](/Users/roy/Downloads/data-plan.md:12)) but does not preserve or explicitly deprecate the current documented `--refresh-monthly` and `--refresh-raw-store` flows. Those are in current project guidance ([AGENTS.md](/Users/roy/Documents/quant/AGENTS.md:47), [AGENTS.md](/Users/roy/Documents/quant/AGENTS.md:53)) and implemented in the current production CLI ([cli_build_production_dataset.py](/Users/roy/Documents/quant/src/quantresearch/cli/cli_build_production_dataset.py:51)). Keep them as aliases for at least one transition or require the same patch to update all docs/tests/callers and add compatibility tests.

5. **Medium: SSE-only date resolution is too narrow for an all-A-share pipeline.**
The plan specifies the SSE official calendar as the resolver source ([data-plan.md](/Users/roy/Downloads/data-plan.md:63)). The project validates SSE, SZSE, and BSE listed counts in Tushare validation ([cli_validate_tushare.py](/Users/roy/Documents/quant/src/quantresearch/cli/cli_validate_tushare.py:21)), while execution and benchmark artifacts consume stock, ETF, and benchmark data with different endpoint lags. SSE is a good base calendar, but the resolver should also verify Tushare `trade_cal` and endpoint freshness for every consumed family before treating a date as complete. The specific 2026-05-02 fixture is correct: SSE says Labor Day closure is May 1-5, 2026 and normal trading resumes May 6 (SSE source: https://www.sse.com.cn/disclosure/announcement/general/c/c_20260423_10816345.shtml).

6. **Low: The integration test wording can produce false positives.**
The plan says no deprecated console script names should appear in the production execution path ([data-plan.md](/Users/roy/Downloads/data-plan.md:156)), but those names must remain in `pyproject.toml`, docs, bypass errors, and tests ([pyproject.toml](/Users/roy/Documents/quant/pyproject.toml:24)). Make this an AST or module-boundary assertion against `cli_build_production_dataset.py` and the new orchestrator internals: no `subprocess`, no `_uv_command`, no `uv run`, and no direct public CLI `main()` calls.

**Overall**
The plan is directionally strong and addresses the current biggest defects: hardcoded `20260424`, subprocess orchestration, stale defaults, and unsafe direct writers. The main changes needed are tighter mode semantics, a clean execution-vs-ML contract, explicit training/prediction artifact separation, and a compatibility path for existing flags.
```

Current plan:

```markdown
# Unified Non-Level-2 Refresh With Legacy CLI Deprecation

## Summary
Refactor `quant-build-production-dataset` into the single canonical refresh entrypoint for all non-Level-2 data, then deprecate the old direct refresh/build CLIs after the unified path no longer shells out to them. Default behavior remains **daily-first**: resolve the latest completed SSE trading day, refresh daily/reference data, build and gate execution-ready artifacts, and build/gate ML-ready training artifacts only when the label exit horizon is complete.

## Key Changes
- Make `quant-build-production-dataset` the only default public refresh command:
  - optional `--end-date`; omitted resolves to the latest completed SSE open day using Asia/Shanghai time, the SSE trading calendar, and an after-close cutoff
  - generated labels and all derived paths come from a single `RefreshContext`, with no hardcoded `20260424` orchestration paths or downstream builder defaults
  - `--dry-run` emits the full step plan, resolved dates, labels, explicit input/output paths, input hashes when files already exist, skip reasons, and checkpoint reuse decisions
  - `--strict-full` fails if ML-ready training labels cannot be completed
  - `--mode daily-refresh|monthly-refresh|full-refresh` makes operator intent explicit while keeping one public entrypoint
  - `--skip-baostock` reuses existing audited BaoStock/patch artifacts only; it fails if required active-identity artifacts are absent and records freshness/status
  - `--enable-gdelt-doc-api` opts into slower GDELT document diagnostics; default daily and monthly refreshes keep the current DOC API disabled behavior and record skipped status plus any reused macro/event inputs
- Orchestrate all non-Level-2 families in dependency order:
  - Tushare validation, endpoint freshness probes, and latest-date resolution
  - stock master/BaoStock/sentinels
  - daily A-share store, ETF universe/store/reference
  - benchmark import/source audit, constituents, and returns
  - fundamentals, PIT fundamentals, official industry manifest validation/reuse, conditional official industry manifest discovery/build, PIT industry, non-L2 reference
  - regimes, macro/events with GDELT DOC diagnostics only when explicitly enabled, noise layer
  - execution-ready build/gate
  - ML-ready build/gate only when `label_complete_through` covers the monthly signal; otherwise the latest month is prediction-only or excluded from gated training labels and the ML step emits skipped output metadata instead of training artifacts
- Add a shared internal orchestration layer so the unified command does not shell out to public CLIs. Old CLI modules keep current behavior until the production command is migrated, then call the shared step functions only after an explicit bypass flag.
- Add checkpoint/resume semantics before broad deprecation lands:
  - stable step IDs
  - started/completed timestamps
  - normalized inputs, input hashes, output paths, and output hashes
  - `rebuilt`, `reused_existing`, `skipped`, `stale`, `failed`, and `gated` statuses
  - resume decisions based on matching context labels, paths, hashes, and step versions

## Implementation Sequence
1. Add date/context resolution, dry-run schema, freshness registry, and checkpoint metadata while keeping existing public CLIs callable.
2. Extract shared callable step APIs for each builder/refresher/gate so the public CLI wrappers and production orchestrator can share implementation without subprocess invocation. This step must land before any direct CLI wrapper requires `--allow-manual-data-step`.
3. Migrate `quant-build-production-dataset` to the shared step APIs and verify no production execution path calls deprecated console script names, direct public CLI `main()` functions, or `uv run` command lists.
4. Add `--allow-manual-data-step` guards to direct data-writing CLI wrappers only after the production command is self-contained.
5. Update docs and deprecation inventory after guard behavior and bypass tests pass.

## Refresh Context
- Introduce one immutable `RefreshContext` created by `quant-build-production-dataset` before any step runs:
  - `start_date`
  - `requested_end_date`
  - `daily_end_date`
  - `feature_snapshot_end`
  - `entry_data_end`
  - `label_complete_through`
  - `monthly_signal_end`
  - `latest_rebalance_data_date`
  - `ml_training_label_end`
  - `prediction_only_signal_end`
  - generated label set for daily, monthly, execution-ready, ML-ready, benchmark, ETF proxy, regime, macro/event, PIT fundamentals, PIT industry, and non-L2 reference artifacts, including skipped-output labels for artifacts that are not materialized in the selected mode
  - all derived input/output paths for every builder and gate
  - command mode, skip flags, bypass policy, and checkpoint location
- Every orchestrated step must receive explicit context paths and labels. No step may rely on its standalone CLI defaults for production orchestration.
- Manifest output must record the actual input paths, input hashes, output paths, output hashes, generated labels, source date coverage, source staleness, and whether each artifact was rebuilt or reused.
- Production manifests and tests must verify recorded paths and hashes use the generated label for the requested refresh, not stale defaults from `20260424` or any other prior run.
- `feature_snapshot_end` is the latest month-end whose monthly features can be computed.
- `entry_data_end` is the latest rebalance entry date with complete open-price inputs.
- `label_complete_through` is the latest month-end whose label exit horizon has complete exit-price data. If `monthly_signal_end` is later than `label_complete_through`, that month must be marked `prediction_only` or excluded from gated ML training output; it must not silently produce partial labels.
- When ML-ready training is skipped, `RefreshContext` still emits the intended ML-ready label/path plus a `skipped` step status and reason. The orchestrator must not create or advertise a completed ML-ready training artifact for that label.

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
- Extend Tushare validation beyond stock-basic access with an endpoint freshness registry. For each endpoint family, declare requiredness by mode (`daily-refresh`, `monthly-refresh`, `full-refresh`), expected data lag, date field used for freshness, retry/backoff policy, stale status text, and whether staleness blocks daily execution, monthly execution, full refresh only, or only marks an optional artifact stale.
- Daily live execution must block on stale daily A-share store inputs, daily_basic, moneyflow, limit data, ETF daily, and any benchmark data required by execution-ready outputs. Slower or lower-priority non-Level-2 families must block only the modes/artifacts that consume them, so optional or monthly-only freshness failures cannot make routine daily refresh flaky.
- Fund adjustment, fund NAV, benchmark import/source files, benchmark constituents/returns, fundamentals, PIT fundamentals, official industry manifests/source files, macro/event, regime, noise, and other configured non-Level-2 families must be explicitly classified in the registry instead of covered by one broad all-or-nothing freshness gate.
- Freshness decisions must cover raw endpoint probes and derived local inputs. Derived inputs such as pinned official industry manifests, imported benchmark constituent sources, and reused macro/event artifacts must record path, hash, coverage, source staleness, and consuming artifacts before live steps run.

## Legacy CLI Deprecation
- Deprecate direct data-refresh/build entrypoints by requiring `--allow-manual-data-step` when run directly:
  - `quant-build-monthly-history`, `quant-build-universe-history`, `quant-build-etf-universe`
  - `quant-backfill-store`, `quant-backfill-etf-store`, `quant-backfill-etf-reference`
  - `quant-backfill-fundamentals`, `quant-backfill-non-l2-reference`
  - `quant-backfill-benchmark-constituents`, `quant-backfill-benchmark-returns`
  - `quant-import-benchmark-constituents`
  - `quant-build-etf-proxy-returns`, `quant-build-regime-tags`, `quant-build-macro-event-layer`
  - `quant-build-noise-layer`, `quant-build-ml-dataset`, `quant-build-fundamental-features`
  - `quant-build-pit-industry`, `quant-build-official-industry-manifest`
  - `quant-build-baostock-reference`, `quant-build-baostock-sentinels`
  - `quant-build-execution-ready-dataset`
- If `quant-import-benchmark-constituents` is kept as an official manual import instead of a refresh command, document that distinction and still require `--allow-manual-data-step` plus explicit source/path arguments.
- Keep validation/gate commands active and not deprecated:
  - `quant-validate-tushare`
  - `quant-validate-store`
  - `quant-gate-ml-dataset`
  - `quant-gate-execution-ready-dataset`
- Direct deprecated CLIs should fail fast only after the implementation sequence has migrated production orchestration to shared step APIs. The failure message must include:
  - replacement command: `uv run quant-build-production-dataset`
  - escape hatch: rerun with `--allow-manual-data-step`
  - clear note that manual runs are for troubleshooting, diagnostics, or isolated reruns only
- `quant-build-execution-ready-dataset` is a builder, so it is internal/orchestrator-only by default and requires `--allow-manual-data-step` when invoked directly. `quant-gate-execution-ready-dataset` remains unrestricted.
- Manual bypass runs must preserve current standalone behavior only when real arguments are provided explicitly. Add a central helper that each guarded CLI calls to declare required explicit arguments under `--allow-manual-data-step`; production-sensitive defaults for ML dataset inputs, execution-ready inputs, fundamental feature dates, benchmark imports, and all output paths must not be accepted silently in bypass mode.
- The shared bypass helper must produce a per-CLI contract used by implementation and tests: argument names that must be explicit, defaults that are forbidden in bypass mode, artifact paths that must be recorded in JSON, and whether the CLI is a refresh/build/import category.
- `quant-build-official-industry-manifest` is part of the unified orchestration because PIT industry consumes its source manifest, but default daily and monthly refreshes should reuse a pinned manifest after validating coverage, source staleness, hashes, and path existence. Discovery/download/build is allowed by default only when the pinned manifest is missing, coverage is insufficient for the requested context, staleness exceeds the registry threshold, or `--mode full-refresh` explicitly requests a refreshable external-source pass. If an operator bypass reuses an existing manifest, output JSON must record manifest path, source period coverage, source staleness, hash, and reuse status.
- GDELT DOC API default behavior is opt-in. Without `--enable-gdelt-doc-api`, missing or stale DOC diagnostics are recorded as `skipped_optional` and must not fail daily/monthly macro/event builds; reused macro/event inputs still record path, hash, coverage, and staleness. With `--enable-gdelt-doc-api`, DOC API failures follow the macro/event freshness registry classification for the selected mode.
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
uv run quant-build-production-dataset --enable-gdelt-doc-api
```

Output JSON includes `requested_end_date`, `daily_end_date`, `requested_end_date_status`, `feature_snapshot_end`, `entry_data_end`, `label_complete_through`, `monthly_signal_end`, `monthly_boundary_status`, `prediction_only_signal_end`, command mode, generated labels/paths, endpoint and derived-input freshness decisions by family, per-step statuses, checkpoint decisions, skipped/reused/stale/failed/gated states, execution-ready gate status, and ML-ready status.

For `--skip-baostock`, output JSON must still include the active stock-universe identity source, patched master path, audited patch source path, sentinel status, freshness, and whether the required artifacts were reused.

## Test Plan
- Dry-run tests:
  - generated plan contains no stale `20260424` paths for a new end date
  - all non-Level-2 data families appear by default
  - generated plan includes official industry manifest validation/reuse before PIT industry, with discovery/build only when pinned coverage or staleness checks require it or full-refresh requests it
  - generated plan includes explicit generated inputs for production constants, ML dataset, execution-ready, ETF proxy, macro regimes, benchmark, labels, and gates
  - ML-ready training output is skipped with a clear reason when `label_complete_through` does not cover `monthly_signal_end`
  - latest month is marked prediction-only or excluded from gated training labels when entry data exists but label exit data is incomplete
  - default macro/events dry-run records GDELT DOC API diagnostics as skipped unless `--enable-gdelt-doc-api` is present
  - dry-run fixture covers a month-end-complete date
  - dry-run fixture covers an incomplete monthly boundary
- Deprecation tests:
  - deprecation guards are added only after production orchestration uses shared step APIs instead of public CLI subprocesses
  - each deprecated direct CLI exits nonzero without `--allow-manual-data-step`
  - deprecated direct CLIs run their existing behavior with the bypass flag only when the central helper confirms all required real arguments were provided explicitly
  - `quant-build-execution-ready-dataset` requires `--allow-manual-data-step` when run directly
  - bypass runs require explicit real arguments for production-sensitive paths and do not fall back to stale defaults
  - central bypass helper enforces each CLI's required explicit arguments, including ML dataset inputs, execution-ready inputs, fundamental feature dates, benchmark imports, and output paths
  - `quant-import-benchmark-constituents` is guarded as a data-writing manual step, or documented as an official import that still requires bypass plus explicit required arguments
  - gate/validation commands remain callable without bypass
- Resolver and behavior tests:
  - holiday/weekend resolves to prior completed open day
  - `today=2026-05-02` resolves `daily_end_date=20260430`
  - explicit closed `--end-date` preserves `requested_end_date`, snaps `daily_end_date` backward, and records the closed/incomplete status
  - endpoint freshness registry blocks only the modes/artifacts that require the stale family, with daily blockers covering daily, daily_basic, moneyflow, limits, ETF daily, and execution-ready benchmark requirements
  - slower or optional families such as fund_adj, fund_nav, official industry discovery, macro/event DOC diagnostics, and monthly-only non-Level-2 families do not block daily-refresh unless their consuming artifact is requested
  - derived-input freshness records path, hash, coverage, and staleness for pinned official industry manifests, benchmark import sources, and reused macro/event inputs
  - `--strict-full` fails when ML-ready would be skipped
  - daily-first mode can succeed with execution-ready gated and ML skipped
- Integration tests:
  - production orchestration uses an internal API with stubbed steps instead of `uv run` subprocess command lists
  - no deprecated console script names appear in the production execution path
  - every step receives explicit paths from `RefreshContext`
  - ML labels are complete only through `label_complete_through`; incomplete latest-month labels are excluded from gated training artifacts
  - default daily/monthly macro/event orchestration does not call the GDELT DOC API without `--enable-gdelt-doc-api`
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

Return only JSON matching the provided schema.
