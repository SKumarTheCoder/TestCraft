# AGENTS.md — Mobile Test Automation System

## Project structure

- `scripts/` — entrypoints for all pipeline commands
- `src/generator/` — Zephyr Scale → AI test generation
- `src/runner/` — WebdriverIO config + BrowserStack upload + test specs
- `src/fixer/` — AI-driven auto-heal for failing tests
- `src/reporter/` — Slack reporting
- `src/shared/` — LLM client (OpenAI / Anthropic), pino logger

## First-time setup

```bash
cp .env.example .env
# fill in all secrets
npm install
```

## Commands

| Command | What it does |
|---|---|
| `npm run generate:tests` | Fetch Zephyr cases → AI generates `.spec.ts` files → writes to `src/runner/specs/{platform}/`. Set `VALIDATE_GENERATED_TESTS=true` to also run + auto-fix on BrowserStack before commit. |
| `npm run test:android` | `wdio run src/runner/wdio.android.conf.ts` — runs on BrowserStack |
| `npm run test:ios` | `wdio run src/runner/wdio.ios.conf.ts` — runs on BrowserStack |
| `npm run fix` | `tsx scripts/auto-fix.ts` — parses failure logs, generates patch, re-runs fixed tests |
| `npm run validate:tests` | `tsx scripts/validate-tests.ts` — runs tests + auto-fix loop up to `VALIDATION_MAX_RETRIES` (default 3) |
| `npm run report:slack` | `tsx scripts/send-slack-report.ts` |

All scripts use `tsx` to run TypeScript directly (no compile step).

## CI workflows

- **`generate-tests.yml`** — manual workflow_dispatch; optional `validate` input runs + auto-fix on BrowserStack before committing. Commits with `[skip ci]`.
- **`nightly.yml`** — scheduled (2 AM IST) + workflow_dispatch; builds → BrowserStack → auto-fix → Slack report. Uses `fail-fast: false` matrix for Android + iOS. Auto-fix commits with `[skip ci]`.

## Key conventions

- **Locator strategy:** Prefer `accessibilityID` (maps to RN `accessibilityLabel`), fallback to class+text XPath
- **Auto-fix scope:** test-level only (locators, waits, assertions — never fixes app code)
- **LLM:** Provider chosen by which env var is set. Default models: `gpt-4o` (OpenAI), `claude-sonnet-4-20250514` (Anthropic). Override via `TEST_GENERATION_MODEL` / `AUTO_FIX_MODEL`.
- **Generated test output:** always written to `src/runner/specs/{android,ios}/`
- **Validation retries:** controlled by `VALIDATION_MAX_RETRIES` (default 3)
- **Git commits from CI** always use `[skip ci]` to prevent workflow re-trigger

## Environment

Config is loaded from `.env` via `dotenv` (called at script top in each entrypoint). Required vars: see `.env.example`.

## No-op notes

- No lint, typecheck, or unit test scripts exist
- No pre-commit hooks or task runner config
- `tsc` build not needed locally (tsx runs source directly)
