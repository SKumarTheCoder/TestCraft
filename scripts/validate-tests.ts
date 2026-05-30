import { config } from "dotenv";
config();

import * as fsAsync from "node:fs/promises";
import * as fs from "node:fs";
import * as path from "node:path";
import { execSync } from "node:child_process";
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
  stats?: { passed: number; failed: number; skipped: number };
  results: JsonTestResult[];
}

const MAX_RETRIES = parseInt(process.env.VALIDATION_MAX_RETRIES ?? "3", 10);

function runTests(platform: "android" | "ios"): void {
  const cmd = platform === "android" ? "npm run test:android" : "npm run test:ios";
  logger.info({ platform, cmd }, "Running tests");
  execSync(cmd, { stdio: "inherit", cwd: process.cwd() });
}

function parseResults(resultsDir: string): WdioReport {
  const reportPath = path.join(resultsDir, "wdio-report.json");
  try {
    const content = fs.readFileSync(reportPath, "utf-8");
    return JSON.parse(content) as WdioReport;
  } catch {
    return { results: [] };
  }
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
  if (normalized.includes("/ios/")) return "ios";
  return "android";
}

interface ValidationResult {
  platform: "android" | "ios";
  passed: boolean;
  attempts: number;
  totalTests: number;
  passedTests: number;
  failedTests: number;
  fixes: FixResult[];
}

export async function validatePlatform(
  platform: "android" | "ios",
  resultsDir: string
): Promise<ValidationResult> {
  logger.info({ platform, maxRetries: MAX_RETRIES }, "Validating platform");

  let allFixes: FixResult[] = [];
  let attempt = 0;

  while (attempt < MAX_RETRIES) {
    attempt++;
    logger.info({ platform, attempt }, "Test attempt");

    runTests(platform);
    const report = parseResults(resultsDir);

    const totalTests = report.results.length;
    const passedTests = report.results.filter((r) => r.state === "passed").length;
    const failedTests = report.results.filter((r) => r.state === "failed").length;

    logger.info({ platform, attempt, totalTests, passedTests, failedTests }, "Attempt results");

    if (failedTests === 0) {
      logger.info({ platform, attempt }, "All tests passed");
      return {
        platform,
        passed: true,
        attempts: attempt,
        totalTests,
        passedTests,
        failedTests,
        fixes: allFixes,
      };
    }

    if (attempt >= MAX_RETRIES) {
      logger.warn({ platform, attempt }, "Max retries reached");
      return {
        platform,
        passed: false,
        attempts: attempt,
        totalTests,
        passedTests,
        failedTests,
        fixes: allFixes,
      };
    }

    const failedTestsList = report.results.filter((r) => r.state === "failed");
    logger.info({ platform, attempt, fixCount: failedTestsList.length }, "Attempting auto-fix");

    for (const test of failedTestsList) {
      const testName = extractTestName(test.title, test.file);
      const testPlatform = determinePlatform(test.file);
      const testFilePath =
        test.file ??
        path.join("src", "runner", "specs", platform, `${testName.replace(/\s+/g, "_")}.spec.ts`);

      try {
        const analysis: FailureAnalysis = await analyzeFailure(
          testFilePath,
          testName,
          test.error?.message ?? "Unknown error",
          resultsDir,
          testPlatform
        );

        const result = await applyFix(analysis);
        allFixes.push(result);

        logger.info({ testFile: testFilePath, success: result.success }, "Fix result");
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        logger.error({ testFile: testFilePath, error: message }, "Fix error");
        allFixes.push({ testFile: testFilePath, success: false, appliedFix: false, error: message });
      }
    }
  }

  return {
    platform,
    passed: false,
    attempts: attempt,
    totalTests: 0,
    passedTests: 0,
    failedTests: 0,
    fixes: allFixes,
  };
}

async function main() {
  const platform = (process.env.TARGET_PLATFORM ?? "both") as "android" | "ios" | "both";
  const resultsDir = process.env.TEST_RESULTS_DIR ?? "./test-results";

  await fsAsync.mkdir(resultsDir, { recursive: true });

  const platforms = platform === "both" ? ["android", "ios"] as const : [platform];

  const results: ValidationResult[] = [];
  let allPassed = true;

  for (const p of platforms) {
    const result = await validatePlatform(p, resultsDir);
    results.push(result);
    if (!result.passed) allPassed = false;
  }

  for (const r of results) {
    logger.info(
      { platform: r.platform, passed: r.passed, attempts: r.attempts, total: r.totalTests, passedTests: r.passedTests, failedTests: r.failedTests },
      r.passed ? "VALIDATION PASSED" : "VALIDATION FAILED"
    );
  }

  const outputPath = path.join(resultsDir, "validation-results.json");
  await fsAsync.writeFile(outputPath, JSON.stringify(results, null, 2), "utf-8");

  if (!allPassed) {
    logger.error("Some platforms failed validation");
    process.exit(1);
  }

  logger.info("All platforms validated successfully");
}

const isMainModule = import.meta.url === `file://${process.argv[1]}`;
if (isMainModule) {
  main().catch((err) => {
    logger.error(err, "Validation failed");
    process.exit(1);
  });
}
