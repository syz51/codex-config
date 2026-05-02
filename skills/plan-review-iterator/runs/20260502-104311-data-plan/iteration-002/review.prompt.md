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
Refactor `quant-build-production-dataset` into the single canonical refresh entrypoint for all non-Level-2 data, then deprecate the old direct refresh/build CLIs after the unified path no longer shells out to them. Default behavior remains **daily-first**: resolve the latest completed trading day from the SSE calendar cross-checked against Tushare `trade_cal` and consumed endpoint freshness, execute only daily/execution-required refresh work, reuse or mark slow monthly/full families according to an explicit mode matrix, build and gate execution-ready artifacts, and build/gate ML-ready training artifacts only when the label exit horizon is complete.

## Key Changes
- Make `quant-build-production-dataset` the only default public refresh command:
  - optional `--end-date`; omitted resolves to the latest completed open day using Asia/Shanghai time, the SSE trading calendar as the base calendar, Tushare `trade_cal` verification, consumed endpoint freshness probes, and an after-close cutoff
  - generated labels and all derived paths come from a single `RefreshContext`, with no hardcoded `20260424` orchestration paths or downstream builder defaults
  - `--dry-run` emits the full step plan, resolved dates, labels, explicit input/output paths, input hashes when files already exist, skip reasons, and checkpoint reuse decisions
  - `--strict-full` fails if ML-ready training labels cannot be completed
  - `--mode daily-refresh|monthly-refresh|full-refresh` makes operator intent explicit while keeping one public entrypoint and driving per-family `execute`, `probe`, `reuse_existing`, `skip_optional`, or `block_if_stale` actions
  - transition aliases remain supported for compatibility: `--refresh-monthly` maps to `--mode monthly-refresh`, and `--refresh-raw-store` forces daily raw-store families to `execute` within the selected mode; both emit deprecation warnings and are covered by compatibility tests
  - `--skip-baostock` reuses existing audited BaoStock/patch artifacts only; it fails if required active-identity artifacts are absent and records freshness/status
  - `--enable-gdelt-doc-api` opts into slower GDELT document diagnostics; default daily and monthly refreshes keep the current DOC API disabled behavior and record skipped status plus any reused macro/event inputs
- Represent all non-Level-2 families in dependency order, but execute only the families required by the selected mode:
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
3. Migrate `quant-build-production-dataset` to the shared step APIs and verify the production module boundary by AST: no `subprocess`, no `_uv_command`, no `uv run` command lists, and no direct public CLI `main()` calls in `cli_build_production_dataset.py` or new orchestrator internals.
4. Add `--allow-manual-data-step` guards to direct data-writing CLI wrappers only after the production command is self-contained.
5. Keep `--refresh-monthly` and `--refresh-raw-store` as deprecated aliases until docs, tests, and known callers have migrated; only then remove or hard-fail them in a separate compatibility-breaking change.
6. Update docs and deprecation inventory after guard behavior, bypass tests, and legacy-flag compatibility tests pass.

## Mode Matrix
- The dry-run output must include every non-Level-2 family by default, but the family row records the selected action instead of implying every family will rebuild. Valid actions are:
  - `execute`: run the live builder/refresher for this context
  - `probe`: query enough metadata or local state to decide freshness without rebuilding
  - `reuse_existing`: consume a validated local artifact and record path, hash, coverage, and staleness
  - `skip_optional`: intentionally omit an optional artifact and record the reason
  - `block_if_stale`: do not rebuild by default, but fail the consuming artifact if the validated input is stale or missing
- Initial family action matrix:

| Family | `daily-refresh` default | `monthly-refresh` default | `full-refresh` default |
| --- | --- | --- | --- |
| Date resolver, Tushare auth, `trade_cal`, and endpoint freshness probes | `execute` | `execute` | `execute` |
| Stock master, BaoStock patches, and sentinels | `execute`; `--skip-baostock` changes BaoStock work to `reuse_existing` plus `block_if_stale` | `execute` unless `--skip-baostock` | `execute` |
| Daily A-share store, `daily_basic`, moneyflow, and limit data | `execute` and `block_if_stale` for execution-ready consumers | `execute` | `execute` |
| ETF universe, ETF daily store, and ETF reference | `execute` for ETF daily/execution inputs; `probe` or `reuse_existing` for slower reference inputs | `execute` | `execute` |
| Benchmark source imports, constituents, and returns | `probe` plus `reuse_existing`; `block_if_stale` when execution-ready outputs consume the benchmark | `execute` when monthly coverage is stale, otherwise `reuse_existing` | `execute` |
| Fundamentals and PIT fundamentals | `probe` plus `reuse_existing`; `block_if_stale` only for requested consumers | `execute` | `execute` |
| Official industry manifest | validate pinned manifest with `reuse_existing`; discovery/build only if missing, insufficient, or stale beyond threshold | same as daily | `execute` discovery/build unless explicitly reusing a valid pinned manifest |
| PIT industry | `reuse_existing` or `block_if_stale` for consumers | `execute` | `execute` |
| Non-L2 reference | `probe` plus `reuse_existing` for required reference files; no all-code rebuild by default | `execute` for monthly-required coverage | `execute` |
| Regime and noise layers | `reuse_existing` or `block_if_stale` for execution-ready consumers | `execute` | `execute` |
| Macro/events | `reuse_existing` for existing macro/event inputs; GDELT DOC diagnostics are `skip_optional` unless enabled | `execute` non-DOC macro/event build; DOC diagnostics remain opt-in | `execute`; DOC diagnostics follow `--enable-gdelt-doc-api` |
| Execution-ready build/gate | `execute` and gate | `execute` and gate | `execute` and gate |
| ML-ready training build/gate | `execute` only when `label_complete_through >= monthly_signal_end`; otherwise `skip_optional` with skipped metadata | `execute` when labels complete; otherwise `block_if_stale` or fail under `--strict-full` | `execute`; fail under `--strict-full` if labels incomplete |
| Prediction-only latest-month artifact | `execute` when entry data exists but label exit data is incomplete | `execute` when applicable | `execute` when applicable |
- `--refresh-raw-store` overrides the matrix only for raw daily store families by forcing their action to `execute`; it must not imply a full non-Level-2 rebuild.
- `--dry-run` must show the matrix-resolved action, reason, inputs, outputs, and blocking relationship for each family so daily operators can see which slow families are reused, optional, or stale-blocking without running them.

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
  - `training_context_ml_ready_dir`, pointing to the last known gated ML-ready artifact when execution-ready or downstream research metadata needs historical training context while the current ML-ready label is skipped
  - per-family mode actions from the mode matrix, including `execute`, `probe`, `reuse_existing`, `skip_optional`, or `block_if_stale`
  - generated label set for daily, monthly, execution-ready, ML-ready, benchmark, ETF proxy, regime, macro/event, PIT fundamentals, PIT industry, and non-L2 reference artifacts, including skipped-output labels for artifacts that are not materialized in the selected mode
  - all derived input/output paths for every builder and gate
  - command mode, skip flags, bypass policy, and checkpoint location
- Every orchestrated step must receive explicit context paths and labels. No step may rely on its standalone CLI defaults for production orchestration.
- Manifest output must record the actual input paths, input hashes, output paths, output hashes, generated labels, source date coverage, source staleness, and whether each artifact was rebuilt or reused.
- Production manifests and tests must verify recorded paths and hashes use the generated label for the requested refresh, not stale defaults from `20260424` or any other prior run.
- `feature_snapshot_end` is the latest month-end whose monthly features can be computed.
- `entry_data_end` is the latest rebalance entry date with complete open-price inputs.
- `label_complete_through` is the latest month-end whose label exit horizon has complete exit-price data. If `monthly_signal_end` is later than `label_complete_through`, that month must be marked `prediction_only` or excluded from gated ML training output; it must not silently produce partial labels.
- Before the ML-ready builder writes `features.parquet`, `labels.parquet`, or `splits.parquet`, it must enforce a hard training cutoff where every gated training row has `signal_date <= ml_training_label_end`. Rows after that cutoff must not appear in gated ML training artifacts, even with `exclude_from_label` flags.
- Prediction-only rows must be written to a separate artifact boundary, such as `prediction_ready_v1/<label>/`, or a clearly named prediction-only subdirectory that is not accepted by `quant-gate-ml-dataset` as training input. The manifest must record the separation and the reason each row group is prediction-only.
- The ML-ready gate must assert label completeness, including `max(signal_date) <= ml_training_label_end` for gated training artifacts and no incomplete-label rows in `labels.parquet` or `splits.parquet`.
- When ML-ready training is skipped, `RefreshContext` still emits the intended ML-ready label/path plus a `skipped` step status and reason. The orchestrator must not create or advertise a completed ML-ready training artifact for that label.
- Execution-ready artifacts are not allowed to treat the current skipped ML-ready label as an input. If execution-ready metadata needs model-training lineage, it records `training_context_ml_ready_dir` separately from execution inputs, and the execution manifest source boundary must describe daily execution inputs plus optional historical training context instead of implying `curated_daily_panels_plus_gated_monthly_ml_ready` for the current run.

## Date Resolution and Freshness
- Date resolution uses Asia/Shanghai local date/time, the SSE official trading calendar as the base exchange calendar, Tushare `trade_cal` as a cross-check, and endpoint freshness probes for every consumed family before treating a date as complete.
- If the SSE calendar and Tushare `trade_cal` disagree for a candidate A-share open day, the resolver must mark the date `calendar_disagreement`, snap backward only to a date both sources agree is open, and emit evidence in dry-run/output JSON. It must not silently accept a disputed date for execution.
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
- The endpoint registry must include every family consumed by stock, ETF, benchmark, execution-ready, ML-ready, macro/event, regime, noise, fundamentals, PIT industry, and non-L2 reference outputs. The resolver must evaluate only the families consumed by the selected mode or by a `block_if_stale` dependency.
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
- `quant-build-production-dataset --refresh-monthly` and `quant-build-production-dataset --refresh-raw-store` are not direct deprecated CLIs during the transition. They remain accepted aliases on the canonical command, emit deprecation warnings, and are removed only after docs, `AGENTS.md`, tests, and callers no longer document or require them.
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
uv run quant-build-production-dataset --refresh-monthly        # deprecated alias for --mode monthly-refresh
uv run quant-build-production-dataset --refresh-raw-store      # deprecated raw daily store execute override
```

Output JSON includes `requested_end_date`, `daily_end_date`, `requested_end_date_status`, `feature_snapshot_end`, `entry_data_end`, `label_complete_through`, `monthly_signal_end`, `monthly_boundary_status`, `prediction_only_signal_end`, `training_context_ml_ready_dir`, command mode, legacy alias warnings, generated labels/paths, mode-matrix actions by family, endpoint and derived-input freshness decisions by family, per-step statuses, checkpoint decisions, skipped/reused/stale/failed/gated states, execution-ready gate status, ML-ready status, and prediction-only artifact status/path.

For `--skip-baostock`, output JSON must still include the active stock-universe identity source, patched master path, audited patch source path, sentinel status, freshness, and whether the required artifacts were reused.

## Test Plan
- Dry-run tests:
  - generated plan contains no stale `20260424` paths for a new end date
  - all non-Level-2 data families appear by default with an explicit mode-matrix action; default daily dry-run must not imply all families execute
  - default daily dry-run executes only daily/execution-required inputs and marks slow monthly/full families as `probe`, `reuse_existing`, `skip_optional`, or `block_if_stale`
  - generated plan includes official industry manifest validation/reuse before PIT industry, with discovery/build only when pinned coverage or staleness checks require it or full-refresh requests it
  - generated plan includes explicit generated inputs for production constants, ML dataset, execution-ready, ETF proxy, macro regimes, benchmark, labels, and gates
  - ML-ready training output is skipped with a clear reason when `label_complete_through` does not cover `monthly_signal_end`
  - latest month is written only to the prediction-only artifact boundary, or excluded from all gated training artifacts, when entry data exists but label exit data is incomplete
  - dry-run output distinguishes current intended ML-ready label/path from `training_context_ml_ready_dir` when ML-ready is skipped
  - default macro/events dry-run records GDELT DOC API diagnostics as skipped unless `--enable-gdelt-doc-api` is present
  - dry-run fixture covers a month-end-complete date
  - dry-run fixture covers an incomplete monthly boundary
- Deprecation tests:
  - deprecation guards are added only after production orchestration uses shared step APIs instead of public CLI subprocesses
  - `--refresh-monthly` remains accepted on `quant-build-production-dataset`, maps to `--mode monthly-refresh`, and emits a deprecation warning during the transition
  - `--refresh-raw-store` remains accepted on `quant-build-production-dataset`, forces raw daily store family action to `execute`, and emits a deprecation warning during the transition
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
  - SSE calendar and Tushare `trade_cal` are cross-checked; disagreement records `calendar_disagreement` and cannot silently select the disputed date
  - explicit closed `--end-date` preserves `requested_end_date`, snaps `daily_end_date` backward, and records the closed/incomplete status
  - endpoint freshness is verified for every family consumed by the selected mode or a `block_if_stale` dependency before the date is treated as complete
  - endpoint freshness registry blocks only the modes/artifacts that require the stale family, with daily blockers covering daily, daily_basic, moneyflow, limits, ETF daily, and execution-ready benchmark requirements
  - slower or optional families such as fund_adj, fund_nav, official industry discovery, macro/event DOC diagnostics, and monthly-only non-Level-2 families do not block daily-refresh unless their consuming artifact is requested
  - derived-input freshness records path, hash, coverage, and staleness for pinned official industry manifests, benchmark import sources, and reused macro/event inputs
  - `--strict-full` fails when ML-ready would be skipped
  - daily-first mode can succeed with execution-ready gated and ML skipped
- Integration tests:
  - production orchestration uses an internal API with stubbed steps instead of `uv run` subprocess command lists
  - AST/module-boundary assertions for `cli_build_production_dataset.py` and new orchestrator internals forbid `subprocess`, `_uv_command`, `uv run` command lists, and direct public CLI `main()` calls; deprecated console script names may still appear in `pyproject.toml`, docs, bypass errors, and tests
  - every step receives explicit paths from `RefreshContext`
  - ML labels are complete only through `label_complete_through`; incomplete latest-month labels are excluded from gated training artifacts before `features.parquet`, `labels.parquet`, and `splits.parquet` are written
  - ML gate asserts `max(signal_date) <= ml_training_label_end` and rejects incomplete-label rows in gated training artifacts
  - execution-ready manifests do not record the skipped current ML-ready label as an execution input; any historical ML context is recorded only as `training_context_ml_ready_dir`
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
