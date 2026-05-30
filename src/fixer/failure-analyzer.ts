import * as fs from "node:fs/promises";
import * as path from "node:path";
import { logger } from "../shared/logger.js";

export type FailureCategory =
  | "element_not_found"
  | "timeout"
  | "assertion_failed"
  | "app_crash"
  | "network_error"
  | "unknown";

export interface FailureAnalysis {
  testFile: string;
  testName: string;
  category: FailureCategory;
  errorMessage: string;
  failedSelector?: string;
  pageSource?: string;
  screenshotPath?: string;
  originalCode: string;
  platform: "android" | "ios";
}

function categorizeError(message: string): FailureCategory {
  const lower = message.toLowerCase();
  if (
    lower.includes("no such element") ||
    lower.includes("element not found") ||
    lower.includes("unable to locate")
  ) {
    return "element_not_found";
  }
  if (
    lower.includes("timeout") ||
    lower.includes("timed out") ||
    lower.includes("waituntil")
  ) {
    return "timeout";
  }
  if (
    lower.includes("assertion") ||
    lower.includes("expected") ||
    lower.includes("to be") ||
    lower.includes("to equal")
  ) {
    return "assertion_failed";
  }
  if (lower.includes("crash") || lower.includes("anr")) {
    return "app_crash";
  }
  if (
    lower.includes("network") ||
    lower.includes("econnrefused") ||
    lower.includes("enotfound")
  ) {
    return "network_error";
  }
  return "unknown";
}

function extractSelector(message: string): string | undefined {
  const patterns = [
    /selector\s+(?:was\s+)?["']([^"']+)["']/i,
    /locator\s+["']([^"']+)["']/i,
    /element\s+["']([^"']+)["']/i,
    /by\s+["']([^"']+)["']/i,
    /find\s+["']([^"']+)["']/i,
    /~([a-zA-Z0-9_.-]+)/,
  ];

  for (const pattern of patterns) {
    const match = message.match(pattern);
    if (match?.[1]) return match[1];
  }

  return undefined;
}

export async function analyzeFailure(
  testFilePath: string,
  testName: string,
  errorMessage: string,
  resultsDir: string,
  platform: "android" | "ios"
): Promise<FailureAnalysis> {
  logger.info({ testFile: testFilePath, testName }, "Analyzing test failure");

  const originalCode = await fs.readFile(testFilePath, "utf-8").catch(() => "");

  const screenshotDir = path.join(resultsDir, "screenshots");
  const screenshotFiles = await fs.readdir(screenshotDir).catch(() => []);
  const screenshotPath = screenshotFiles.find(
    (f) =>
      f.includes(path.basename(testFilePath, ".spec.ts")) || f.includes(testName)
  );

  const pageSourcePath = path.join(
    resultsDir,
    "page-sources",
    `${path.basename(testFilePath, ".spec.ts")}.xml`
  );
  const pageSource = await fs.readFile(pageSourcePath, "utf-8").catch(() => undefined);

  const category = categorizeError(errorMessage);
  const failedSelector = extractSelector(errorMessage);

  return {
    testFile: testFilePath,
    testName,
    category,
    errorMessage,
    failedSelector,
    pageSource,
    screenshotPath: screenshotPath
      ? path.join(screenshotDir, screenshotPath)
      : undefined,
    originalCode,
    platform,
  };
}
