import { config } from "dotenv";
config();

import * as fs from "node:fs/promises";
import * as path from "node:path";
import { buildReport, TestResult, FixResult } from "../src/reporter/build-report.js";
import { sendSlackReport } from "../src/reporter/slack-notifier.js";
import { logger } from "../src/shared/logger.js";

async function main() {
  const resultsDir = process.env.TEST_RESULTS_DIR ?? "./test-results";
  const runId = process.env.GITHUB_RUN_ID ?? Date.now().toString();
  const environment = process.env.ENVIRONMENT ?? "staging";
  const branch = process.env.GITHUB_REF_NAME ?? "main";

  logger.info({ resultsDir }, "Building Slack report");

  // Load test results
  let results: TestResult[] = [];
  const resultsPath = path.join(resultsDir, "test-results.json");

  try {
    const content = await fs.readFile(resultsPath, "utf-8");
    const parsed = JSON.parse(content);
    results = parsed.results ?? parsed ?? [];
  } catch {
    logger.warn("No test results JSON found — sending empty report");
  }

  // Load fix results if they exist
  let fixes: FixResult[] = [];
  const fixPath = path.join(resultsDir, "fix-results.json");
  try {
    const content = await fs.readFile(fixPath, "utf-8");
    fixes = JSON.parse(content) ?? [];
  } catch {
    logger.info("No fix results found");
  }

  const report = buildReport(runId, results, fixes, environment, branch);

  await sendSlackReport(report);

  logger.info("Slack report sent successfully");
}

main().catch((err) => {
  logger.error(err, "Failed to send Slack report");
  process.exit(1);
});
