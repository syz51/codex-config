Patched only `/Users/roy/Downloads/data-plan.md`.

What changed:
- Moved `quant-build-execution-ready-dataset` behind `--allow-manual-data-step`, leaving only the execution-ready gate unrestricted.
- Added a required `RefreshContext` covering dates, generated labels, all derived paths, skip policy, checkpoint location, and manifest inputs/hashes.
- Tightened date resolution semantics: Asia/Shanghai, SSE calendar, after-close cutoff, closed-date snapping, explicit `requested_end_date` preservation, and freshness probes.
- Corrected the live-date example around the 2026 Labor Day closure. External check used: SSE 2026 closure page, https://www.sse.com.cn/disclosure/dealinstruc/closed/.
- Added official industry manifest orchestration/deprecation details.
- Defined `--skip-baostock` as reuse-only for audited BaoStock/patch artifacts, with required freshness/status reporting.
- Expanded tests for internal orchestration, stale default prevention, manifest path/hash validation, bypass behavior, partial success schema, endpoint freshness, and checkpoint/resume.
- Added the suggested checkpoint/resume contract and `daily-refresh|monthly-refresh|full-refresh` mode posture.

Formal re-review result: all six findings and both additional optimizations are addressed in the plan text. No findings rejected. No code tests were run because this was a plan-file-only patch; validation was a full re-read of the patched Markdown plus targeted checks for the previously problematic terms and examples.