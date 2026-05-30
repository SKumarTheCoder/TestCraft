import { logger } from "../shared/logger.js";

export interface TestResult {
  testName: string;
  status: "passed" | "failed" | "skipped";
  platform: "android" | "ios";
  duration: number;
  error?: string;
  logsUrl?: string;
  videoUrl?: string;
  screenshotUrl?: string;
}

export interface FixResult {
  testFile: string;
  testName: string;
  fixed: boolean;
  error?: string;
}

export interface ReportPayload {
  runId: string;
  timestamp: string;
  duration: number;
  environment: string;
  branch: string;
  summary: {
    total: number;
    passed: number;
    failed: number;
    skipped: number;
    flaky: number;
  };
  results: TestResult[];
  fixes: FixResult[];
}

export function buildReport(
  runId: string,
  results: TestResult[],
  fixes: FixResult[],
  environment = "staging",
  branch = "main"
): ReportPayload {
  const passed = results.filter((r) => r.status === "passed").length;
  const failed = results.filter((r) => r.status === "failed").length;
  const skipped = results.filter((r) => r.status === "skipped").length;
  const total = results.length;
  const totalDuration = results.reduce((sum, r) => sum + r.duration, 0);

  logger.info({ total, passed, failed, skipped }, "Building report");

  return {
    runId,
    timestamp: new Date().toISOString(),
    duration: totalDuration,
    environment,
    branch,
    summary: { total, passed, failed, skipped, flaky: 0 },
    results,
    fixes,
  };
}
