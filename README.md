# TestCraft

AI-driven mobile test automation that generates Appium specs from Zephyr cases, executes them on BrowserStack across Android and iOS, and auto-heals failing tests with LLM-powered fixes.

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        TEST GENERATION (Manual)                         │
│                                                                         │
│  Jira / Zephyr Scale  ──►  AI Generator  ──►  Appium Test Specs        │
│  (test cases+steps)        (OpenAI/Claude)     .spec.ts files          │
│                                                   │                     │
│                                                   ▼                     │
│                                        Commit to repo [skip ci]        │
└─────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────┐
│                      NIGHTLY EXECUTION (Scheduled)                      │
│                                                                         │
│  Build APK + IPA  ──►  Upload to BrowserStack  ──►  Run Tests          │
│                                                      (Android + iOS)    │
│                                                           │             │
│                                                     ┌─────┴─────┐      │
│                                                     ▼           ▼      │
│                                                   PASS         FAIL    │
│                                                     │           │      │
│                                                     ▼           ▼      │
│                                              Slack Report    Auto-Fix  │
│                                                               │       │
│                                                     ┌─────────┼─────┐ │
│                                                     ▼         ▼     ▼ │
│                                              Fix Pass    Fix Fail  Log│
│                                              Commit fix   Report   │  │
│                                              [skip ci]      │      │  │
│                                                           └──┼──┘  │  │
│                                                              ▼     ▼  │
│                                                          Slack Report  │
└─────────────────────────────────────────────────────────────────────────┘
```

## Table of Contents

- [Prerequisites](#prerequisites)
- [Setup](#setup)
- [Configuration](#configuration)
- [Usage](#usage)
- [CI/CD Workflows](#cicd-workflows)
- [Project Structure](#project-structure)
- [Pipeline Details](#pipeline-details)
- [Key Decisions](#key-decisions)

---

## Prerequisites

- **Node.js** >= 20 (used in CI, recommended for local dev)
- **npm** (lockfile is `package-lock.json`)
- API keys for the services you intend to use (see [Configuration](#configuration))
- _(Optional)_ Android/iOS build toolchains for local builds (`gradle`, `xcodebuild`)

## Setup

```bash
# 1. Clone and enter the repo
git clone <repo-url>
cd testcraft

# 2. Create environment file
cp .env.example .env

# 3. Fill in all required secrets (see Configuration below)
#    Edit .env with your API keys

# 4. Install dependencies
npm install
```

## Configuration

All configuration is via environment variables loaded from `.env` at runtime by `dotenv`. Every script calls `config()` from `dotenv` at the top of its entrypoint.

### AI Provider (choose one)

| Variable | Required | Default | Description |
|---|---|---|---|
| `OPENAI_API_KEY` | One of | — | OpenAI API key |
| `ANTHROPIC_API_KEY` | One of | — | Anthropic API key |
| `TEST_GENERATION_MODEL` | No | `gpt-4o` / `claude-sonnet-4-20250514` | LLM for test generation |
| `AUTO_FIX_MODEL` | No | same provider default | LLM for auto-fix |

Provider selection logic (in `src/shared/llm-client.ts`):
- If `ANTHROPIC_API_KEY` is set → uses Anthropic
- If `OPENAI_API_KEY` is set (and no Anthropic key) → uses OpenAI
- If both are unset → throws error

### Jira / Zephyr Scale

| Variable | Required | Description |
|---|---|---|
| `JIRA_BASE_URL` | Yes | Your Atlassian instance URL (e.g. `https://your-domain.atlassian.net`) |
| `JIRA_EMAIL` | Yes | Jira account email |
| `JIRA_API_TOKEN` | Yes | Jira API token |
| `ZEPHYR_PROJECT_KEY` | Yes | Zephyr Scale project key (e.g. `PROJ`) |

### BrowserStack

| Variable | Required | Description |
|---|---|---|
| `BROWSERSTACK_USERNAME` | Yes | BrowserStack account username |
| `BROWSERSTACK_ACCESS_KEY` | Yes | BrowserStack access key |
| `BROWSERSTACK_APP_ID` | No | Static app ID if pre-uploaded (otherwise auto-uploaded in CI) |

### Slack

| Variable | Required | Description |
|---|---|---|
| `SLACK_WEBHOOK_URL` | Yes | Slack incoming webhook URL |
| `SLACK_CHANNEL` | Yes | Channel to post results (e.g. `#mobile-test-results`) |

### Optional

| Variable | Default | Description |
|---|---|---|
| `LOG_LEVEL` | `info` | Pino log level (`debug`, `info`, `warn`, `error`) |
| `TARGET_PLATFORM` | `both` | Platform filter for test generation (`android`, `ios`, `both`) |
| `VALIDATE_GENERATED_TESTS` | `false` | Set to `true` to run + auto-fix generated tests on BrowserStack before commit |
| `VALIDATION_MAX_RETRIES` | `3` | Max auto-fix retry attempts during validation |
| `TEST_RESULTS_DIR` | `./test-results` | Directory for test output artifacts |
| `NODE_ENV` | — | Set to `production` to disable pino pretty-print |

---

## Usage

All commands run TypeScript directly via `tsx` — no `tsc` compile step needed.

### Generate Tests from Zephyr

```bash
# Generate for both platforms (default)
npm run generate:tests

# Target a specific platform
TARGET_PLATFORM=android npm run generate:tests
TARGET_PLATFORM=ios npm run generate:tests
```

What happens:
1. Fetches all test cases from Zephyr Scale (`GET /v2/testcases/{projectKey}`)
2. For each case, fetches test steps (`GET /v2/testcases/{key}/teststeps`)
3. Builds a structured LLM prompt with steps + expected results
4. Calls the configured LLM to generate a WebdriverIO `.spec.ts` file
5. Writes output to `src/runner/specs/{platform}/`

Generated spec files use `accessibilityID` locators (maps to React Native `accessibilityLabel`) with fallback to class+text XPath.

### Run Tests on BrowserStack

```bash
# Run Android tests
npm run test:android

# Run iOS tests
npm run test:ios
```

These invoke `wdio run` with the respective WebdriverIO config file which is pre-configured for BrowserStack execution.

### Auto-Fix Failed Tests

```bash
npm run fix
```

Parses failure logs from the last run, extracts context (failed selector, error type, page source XML), calls the LLM to generate a patch, applies it to the `.spec.ts` file, and re-runs only the fixed tests on BrowserStack.

### Validate Generated Tests

```bash
# Validate both platforms (runs tests + auto-fix loop)
npm run validate:tests

# Validate a specific platform
TARGET_PLATFORM=android npm run validate:tests
```

Runs the generated test suite on BrowserStack and auto-fixes failures in a loop (up to `VALIDATION_MAX_RETRIES`, default 3). Only exits successfully once all tests pass. This is also triggered during `npm run generate:tests` when `VALIDATE_GENERATED_TESTS=true`.

### Send Slack Report

```bash
npm run report:slack
```

Aggregates results from `test-results/` into a Slack Block Kit payload and sends it to the configured channel.

---

## CI/CD Workflows

Two GitHub Actions workflows are defined under `.github/workflows/`.

### `generate-tests.yml` — Manual Test Generation

| Trigger | `workflow_dispatch` |
|---|---|
| **Inputs** | `platform` (both/android/ios), `project_key` (optional override), `model` (LLM override) |
| **Steps** | Checkout → `npm ci` → `npx tsx scripts/generate-tests.ts` → commit generated specs with `[skip ci]` |

### `nightly.yml` — Scheduled Execution + Auto-Fix + Report

| Triggers | `schedule` (daily 2 AM IST), `workflow_dispatch` |
|---|---|
| **Inputs** | `environment` (staging/production), `skip_fix` (boolean) |
| **Node version** | 20 |

Jobs run in order:

```
build-and-upload → test (matrix) → auto-fix → report
```

**build-and-upload job:**
- Builds Android APK (gradle) and iOS IPA (xcodebuild) — placeholder commands, actual build scripts expected to be filled in
- Uploads both to BrowserStack via `POST /app-automate/upload`
- Exports app IDs for downstream jobs

**test job:**
- Matrix: `[android, ios]` with `fail-fast: false` (both platforms run even if one fails)
- Runs `npm run test:android` / `npm run test:ios`
- Uses `continue-on-error: true` to ensure both matrix branches complete
- Uploads results as artifacts with 7-day retention

**auto-fix job:**
- Only runs if any test failed (and `skip_fix` is not set)
- Downloads test result artifacts
- Runs `npx tsx scripts/auto-fix.ts`
- Commits any fixes with message `fix(tests): auto-heal failing locators [skip ci]`
- Commits are made by user `test-automation-bot <bot@automation.local>`

**report job:**
- Always runs (even if prior jobs failed)
- Downloads test result artifacts
- Runs `npx tsx scripts/send-slack-report.ts`
- Has access to `GITHUB_RUN_ID`, `GITHUB_REPOSITORY`, `GITHUB_REF_NAME` for contextual reporting

---

## Project Structure

```
testcraft/
│
├── .env.example                 # Environment variable template
├── .gitignore
├── AGENTS.md                    # OpenCode agent instructions
├── package.json
├── tsconfig.json
│
├── .github/
│   └── workflows/
│       ├── generate-tests.yml   # Manual test generation workflow
│       └── nightly.yml          # Scheduled nightly test workflow
│
├── scripts/                     # CLI entrypoints (run via tsx)
│   ├── generate-tests.ts        # npm run generate:tests
│   ├── auto-fix.ts              # npm run fix
│   ├── validate-tests.ts        # npm run validate:tests
│   └── send-slack-report.ts     # npm run report:slack
│
└── src/
    ├── generator/               # Zephyr → AI → Appium test generation
    │   ├── zephyr-client.ts     # Fetches test cases + steps from Zephyr API
    │   ├── prompt-builder.ts    # Builds structured LLM prompts
    │   ├── llm-client.ts        # (legacy, shared version used instead)
    │   └── test-writer.ts       # Writes generated spec files to disk
    │
    ├── runner/                  # WebdriverIO + BrowserStack execution
    │   ├── wdio.android.conf.ts # WebdriverIO config for Android
    │   ├── wdio.ios.conf.ts     # WebdriverIO config for iOS
    │   ├── specs/               # Generated Appium test files
    │   │   ├── android/
    │   │   └── ios/
    │   ├── pageobjects/         # Shared Page Object pattern files
    │   └── browserstack/
    │       ├── upload.ts        # Uploads app binary to BrowserStack
    │       └── poll-results.ts  # Polls BrowserStack for test results
    │
    ├── fixer/                   # AI-driven auto-heal for failing tests
    │   ├── failure-analyzer.ts  # Parses failure logs for context
    │   ├── fix-prompt.ts        # Builds fix-oriented LLM prompts
    │   └── test-patcher.ts      # Applies AI-generated patches to spec files
    │
    ├── reporter/                # Slack reporting
    │   ├── build-report.ts      # Aggregates results into Block Kit payload
    │   └── slack-notifier.ts    # Sends payload to Slack webhook
    │
    └── shared/                  # Shared utilities
        ├── llm-client.ts        # Unified LLM client (OpenAI / Anthropic)
        └── logger.ts            # Pino logger instance
```

---

## Pipeline Details

### 1. Test Generation

1. Developer triggers `generate-tests.yml` via GitHub Actions UI (manual dispatch)
2. Optionally selects platform target and LLM model override
3. Script fetches all test cases from Zephyr Scale API
4. For each test case, fetches associated test steps
5. Builds a structured prompt: system prompt defines WebdriverIO + Appium conventions, user prompt contains the test steps with expected results
6. LLM generates a complete `.spec.ts` file with:
   - `describe`/`it` blocks mapped to test case hierarchy
   - `accessibilityID` locators as primary strategy
   - Class+text XPath fallbacks
   - Explicit waits where needed
   - Assertions matching expected results
7. File is written to `src/runner/specs/{platform}/{testcase-key}.spec.ts`
8. Generated files are committed with message `chore(tests): auto-generate from Zephyr [skip ci]`

#### Validation Mode

When `VALIDATE_GENERATED_TESTS=true` (or CI `validate` input is set), the generator adds a validation phase after generation:

1. All generated `.spec.ts` files are run on BrowserStack via `validate-tests.ts`
2. If any test fails, the auto-fix pipeline analyzes the failure and patches the locator/waits/assertions
3. The fixed tests are re-run on BrowserStack
4. Steps 2–3 repeat up to `VALIDATION_MAX_RETRIES` (default 3)
5. If all tests pass → commit is allowed; if any still fail → commit is skipped with exit code 1

### 2. Nightly Execution

1. Scheduled trigger at 2 AM IST (Asia/Kolkata timezone), also available as `workflow_dispatch`
2. Build job creates APK (Android) and IPA (iOS) — placeholder commands provided
3. Both binaries uploaded to BrowserStack via their upload API
4. Test job runs as a matrix with `fail-fast: false` — Android and iOS execute independently
5. Each test run generates logs, screenshots, and video capture
6. Results are uploaded as GitHub Actions artifacts

### 3. Auto-Fix

1. Triggered only when one or both platform test suites fail (`needs.test.outputs.*_status == 'failure'`)
2. Downloads failure artifacts from the test job
3. Parses failure logs to extract:
   - Failed selector / locator
   - Error type (element not found, timeout, assertion mismatch)
   - Timing information
4. Gathers additional context: screenshot and page source XML at failure point
5. Sends structured failure context to the configured LLM
6. LLM generates a targeted fix: corrected locator, adjusted wait strategy, or fixed assertion
7. Patch is applied to the `.spec.ts` file
8. Only the fixed tests are re-run on BrowserStack
9. If fix passes → commit with message `fix(tests): auto-heal failing locators [skip ci]`
10. If fix fails → logged for manual review; Slack report still sent

### 4. Slack Reporting

1. Aggregates all results (pass/fail per platform, failed test details, auto-fix status)
2. Builds a Slack Block Kit payload with:
   - Summary header (pass/fail counts per platform)
   - Failed test details with links
   - Auto-fix result (success/skipped/failed)
   - Rerun button (links to workflow_dispatch)
3. Sends via configured Slack webhook

---

## Key Decisions

| Decision | Choice | Rationale |
|---|---|---|
| **Test framework** | WebdriverIO v9 + Appium 2.x | Industry standard for mobile automation; not raw Appium client |
| **Locator strategy** | `accessibilityID` preferred, XPath fallback | Maps to React Native `accessibilityLabel`; more resilient than XPath |
| **AI providers** | OpenAI or Anthropic (configurable) | Interchangeable via env var; defaults to available provider |
| **LLM temperature** | 0.3 (both generation and fix) | Balances creativity with deterministic output |
| **Language** | TypeScript (ESM) | Type safety for test code; `tsx` for direct execution |
| **CI platform** | GitHub Actions | Native GitHub integration, matrix builds, artifact management |
| **Runtime** | `tsx` (no compile step) | Faster iteration; no `tsc` build needed |
| **Logging** | Pino | Structured JSON logging, configurable level, production-ready |
| **Auto-fix scope** | Test-level only | Regenerates locators, waits, assertions only; never modifies app code |
| **CI commit messages** | Include `[skip ci]` | Prevents infinite workflow re-trigger loops |

---

## Technical Stack

| Component | Technology |
|---|---|
| **Runtime** | Node.js 20+, TypeScript 5.5+ |
| **Test framework** | WebdriverIO 9.x, Mocha framework |
| **Mobile automation** | Appium 2.x |
| **Cloud execution** | BrowserStack |
| **AI/LLM** | OpenAI API / Anthropic API |
| **CI/CD** | GitHub Actions |
| **Reporting** | Slack Webhook (Block Kit) |
| **Logging** | Pino |
| **Assertions** | Chai 5.x |

## Notes

- No lint, typecheck, or unit test scripts are configured — the project relies on runtime validation
- No pre-commit hooks or task runner config exist
- `tsc` build is not needed locally; `tsx` runs source TypeScript directly
- The `dist/` directory is gitignored (no build artifacts tracked)
- All generated test output lives in `src/runner/specs/` and is tracked in git
