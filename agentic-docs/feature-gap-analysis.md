# Feature Gap Analysis — Mobile Test Automation System

Date: 30 May 2026
Source: Conversation comparing this DIY system against commercial equivalents (TestMu AI, Perfecto by Perforce, Sofy, Quash, DroidFleet, Mobitru, Pcloudy, Drizz)

---

## Current Capabilities (✅ Have)

- AI test generation from Zephyr Scale test cases + steps
- WebdriverIO v9 + Appium 2.x execution on BrowserStack
- Android + iOS parallel matrix with `fail-fast: false`
- AI auto-fix (selector healing, wait adjustment, assertion repair)
- Slack reporting with pass/fail summary and fix status
- BrowserStack app upload + result polling
- Failure categorization: `element_not_found`, `timeout`, `assertion_failed`, `app_crash`, `network_error`, `unknown`
- Page object pattern (BaseScreen)
- Mocha retries (1 retry per test)
- Screenshot + page source XML captured for auto-fix context
- Configurable LLM provider (OpenAI / Anthropic) with per-purpose model overrides
- GitHub Actions CI/CD (nightly scheduled + manual dispatch)
- Git commits with `[skip ci]` to prevent workflow re-trigger

---

## Gap Analysis

### P0 — Critical (blocking non-developer adoption)

| Feature | Current State | Commercial Baseline | Impact |
|---|---|---|---|
| **Real-time web dashboard** | ❌ Missing. Only way to view progress is GitHub Actions raw logs | Every commercial platform has a live dashboard with test videos, session playback, and drill-down | Non-devs (QA, PM, stakeholders) cannot self-serve. No visibility into running tests. |
| **Historical results database** | ❌ Missing. Results are ephemeral CI artifacts with 7-day retention | All platforms store results permanently with trend charts | Cannot track flakiness, regression trends, or answer "when did this first break?" |
| **Selective / focused re-run** | ❌ Auto-fix re-runs on BrowserStack every time (slow + costly) | Commercial tools cache passed results, re-run only failures, and parallelize | Cost waste: re-running passed tests on BrowserStack is pure overhead. |

### P1 — High (significant operational pain)

| Feature | Current State | Commercial Baseline | Impact |
|---|---|---|---|
| **Flaky test detection** | ❌ No cross-run analytics | Platforms flag tests that alternate pass/fail across runs | Team spends time investigating transient failures. No data to identify flaky tests. |
| **Visual regression testing** | ❌ Screenshots captured but never compared | AI-powered screenshot diffing (pixel-level + layout-level) | UI regressions go undetected between test assertions. |
| **Bidirectional Zephyr sync** | ⚠️ Partial. Only pulls test cases. Never pushes results back. | Commercial tools write pass/fail status back to test management | Zephyr becomes out of sync with actual results. Audit trail broken. |
| **Device/OS matrix flexibility** | ❌ Devices hardcoded in `wdio.*.conf.ts` | UI-based device/OS selection per run, dynamic matrix generation | Changing a device requires config PR + deploy. No ad-hoc device exploration. |
| **Notifications beyond Slack** | ❌ Slack only | Email, Jira, PagerDuty, Teams, webhooks | Single point of notification failure. Nightly failure at 2 AM might go unseen. |

### P2 — Medium (nice-to-have for maturity)

| Feature | Current State | Commercial Baseline | Impact |
|---|---|---|---|
| **Performance monitoring** | ❌ Missing | CPU, memory, battery, network metrics during test runs | Cannot detect performance regressions as part of test suite. |
| **Accessibility checks** | ❌ Missing | Automated aXe / accessibility scan in test flow | Accessibility issues go undetected until manual audit. |
| **Manual test trigger UI** | ❌ Only GitHub Actions workflow_dispatch | One-click "run these tests on these devices" | QA cannot self-serve. Requires developer to trigger runs. |
| **RBAC / multi-tenant** | ❌ No concept of users or teams | Role-based access, team workspaces | No isolation between environments or user groups. |
| **Test data management** | ❌ Missing | Synthetic data generation, test fixtures as code | Each test must manage its own data or rely on real backend state. |
| **Video playback in UI** | ⚠️ Video URLs exist but no embedded viewer | Inline video playback with timeline scrubbing | Must open BrowserStack separately to view test video. Friction for debugging. |
| **On-premise deployment** | ❌ GitHub Actions only (SaaS) | Private cloud, on-prem, hybrid options | Regulated industries (finance, healthcare) cannot use. |

---

## Recommendation: Top 3 to Build First

1. **Dashboard + Results Database** — A lightweight web UI (React or simple Express + templating) backed by SQLite or Postgres. Ingest results from CI artifacts. Provides live run view, historical trends, flaky test detection.
2. **Flaky Test Analytics** — Cross-run analysis in the results database. Flag tests with pass/fail oscillation. Drive selective re-run logic from this data.
3. **Selective Re-run** — Skip passed tests during auto-fix re-run. Only re-execute failed + fixed tests on BrowserStack. Big cost saver.

### Architecture approach for the dashboard

```
┌──────────────────┐     ┌─────────────────┐     ┌──────────────────┐
│  CI Artifacts     │────►│  Ingestion API  │────►│  Results DB       │
│  (test-results/)  │     │  (Express/Node) │     │  (Postgres/SQLite)│
└──────────────────┘     └─────────────────┘     └──────────────────┘
                                                         │
                                                         ▼
                                                  ┌──────────────────┐
                                                  │  Web Dashboard    │
                                                  │  (React / Simple) │
                                                  └──────────────────┘
```

- CI sends results via `curl` to ingestion API at end of `report` job
- Dashboard queries DB for trends, flakiness, device breakdowns
- Web UI shows live run status (polling), history, and per-test drill-down

---

## Reference: Commercial Pricing Context

| Platform | Entry Price | Key Differentiator |
|---|---|---|
| TestMu AI (prev LambdaTest) | ~$100+/mo | Full AI-native, self-healing, real device cloud |
| Perfecto by Perforce | Enterprise ($$$) | Agentic AI, unified functional + performance |
| Sofy | Usage-based | No-code AI agents, store validation |
| Quash | Subscription | Plain-language tests, no Appium setup |
| DroidFleet | $49–$249/mo | AI agents, zero maintenance, cheapest entry |
| Mobitru | Enterprise quote | On-prem option, MCP/AI Copilot |
| Drizz | Subscription | Intent-based testing + Vision AI (newest) |
