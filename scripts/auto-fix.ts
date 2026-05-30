import { config } from "dotenv";
config();

import * as fs from "node:fs/promises";
import * as path from "node:path";
import { analyzeFailure, FailureAnalysis } from "../src/fixer/failure-analyzer.js";
import { applyFix, FixResult } from "../src/fixer/test-patcher.js";
import { logger } from "../src/shared/logger.js";

interface JsonTestResult {
  title: string;
  state: "passed" | "failed" | "skipped";
  error?: { message: string };
  duration?: number;
  file?: string;
}

interface WdioReport {
  results: JsonTestResult[];
}

function findFailedTests(resultsDir: string): WdioReport {
  const reports: WdioReport[] = [];
  const files = fs.readdir(resultsDir).catch(() => []);

  // Wdio outputs JSON in multiple locations; we glob for them at runtime
  const base = path.resolve(resultsDir);
  const candidates = [
    path.join(base, "**/*.json"),
    path.join(base, "wdio-*-report.json"),
    path.join(base, "results", "*.json"),
  ];

  // Simple file scan for any JSON files containing test results
  try {
    const entries = fs.readdirSync(base, { recursive: true }) as string[];
    for (const entry of entries) {
      if (!entry.endsWith(".json")) continue;
      const content = fs.readFileSync(path.join(base, entry), "utf-8");
      try {
        const parsed = JSON.parse(content);
        if (parsed.results || parsed.passed !== undefined) {
          reports.push(parsed);
        }
      } catch {
        // skip unparseable JSON
      }
    }
  } catch {
    // results directory may not exist
  }

  return reports[0] ?? { results: [] };
}

function extractTestName(fullTitle: string, filePath?: string): string {
  if (filePath) {
    const base = path.basename(filePath, ".spec.ts");
    return base.replace(/_/g, " ");
  }
  return fullTitle;
}

function determinePlatform(filePath?: string): "android" | "ios" {
  if (!filePath) return "android";
  const normalized = filePath.replace(/\\/g, "/");
  if (normalized.includes("/ios/") || normalized.includes("\\ios\\"))
    return "ios";
  return "android";
}

async function main() {
  const resultsDir = process.env.TEST_RESULTS_DIR ?? "./test-results";

  logger.info({ resultsDir }, "Starting auto-fix");

  // Find failed tests from Wdio reports
  const report = findFailedTests(resultsDir);
  const failedTests = report.results.filter((r) => r.state === "failed");

  if (failedTests.length === 0) {
    logger.info("No failed tests found. Nothing to fix.");
    process.exit(0);
  }

  logger.info({ count: failedTests.length }, "Found failed tests to fix");

  const fixes: FixResult[] = [];
  let fixCount = 0;
  let failCount = 0;

  for (const test of failedTests) {
    const testName = extractTestName(test.title, test.file);
    const platform = determinePlatform(test.file);
    const testFilePath =
      test.file ??
      path.join(
        "src/runner/specs",
        platform,
        `${testName.replace(/\s+/g, "_")}.spec.ts`
      );

    try {
      const analysis: FailureAnalysis = await analyzeFailure(
        testFilePath,
        testName,
        test.error?.message ?? "Unknown error",
        resultsDir,
        platform
      );

      const result = await applyFix(analysis);
      fixes.push(result);

      if (result.success && result.appliedFix) {
        fixCount++;
      } else {
        failCount++;
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.error({ testFile: testFilePath, error: message }, "Fix error");
      fixes.push({
        testFile: testFilePath,
        success: false,
        appliedFix: false,
        error: message,
      });
      failCount++;
    }
  }

  logger.info(
    { fixed: fixCount, failed: failCount, total: failedTests.length },
    "Auto-fix complete"
  );

  // Output fix results for downstream consumption
  const outputPath = path.join(resultsDir, "fix-results.json");
  await fs.writeFile(outputPath, JSON.stringify(fixes, null, 2), "utf-8");

  console.log(JSON.stringify({ fixed: fixCount, failed: failCount, fixes }));

  if (failCount > 0 && fixCount === 0) {
    process.exit(1);
  }
}

main().catch((err) => {
  logger.error(err, "Auto-fix failed");
  process.exit(1);
});
