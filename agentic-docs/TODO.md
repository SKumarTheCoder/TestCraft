# TODO

## Phase 1 — Foundation (Dashboard + Results DB)

- [ ] Scaffold Express API server with result ingestion endpoint
- [ ] Set up SQLite/Postgres schema: runs, tests, fixes, devices
- [ ] Write CI job to POST results to ingestion API after test run
- [ ] Build web dashboard (React): live run view, history list, per-test drill-down
- [ ] Add run comparison view (side-by-side pass/fail diff)

## Phase 2 — Intelligent Re-run

- [ ] Track per-test result history in DB
- [ ] Implement flaky detection: flag tests with pass/fail oscillation over N runs
- [ ] Modify auto-fix script to skip passed tests, re-run only failed + fixed
- [ ] Add `RERUN_MODE` env var: `all` / `failed-only` / `flaky-only`

## Phase 3 — Integrations & Depth

- [ ] Push test results back to Zephyr Scale (bidirectional sync)
- [ ] Add visual regression: compare screenshots across runs via pixel-diff
- [ ] Add device matrix UI: pick OS version + device per run interactively
- [ ] Add notification channels: email, Jira, PagerDuty

## Phase 4 — Polish

- [ ] Embed BrowserStack video playback in dashboard
- [ ] Add performance metrics (CPU, memory, network) to test run results
- [ ] Add accessibility scan step (aXe) to test flow
- [ ] Role-based access control for dashboard
