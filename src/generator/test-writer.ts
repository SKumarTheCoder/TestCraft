import * as fs from "node:fs/promises";
import * as path from "node:path";
import { ZephyrTestCaseFull } from "./zephyr-client.js";
import { logger } from "../shared/logger.js";

const SPECS_DIR = path.resolve("src/runner/specs");

export function getPlatformDir(platform: "android" | "ios" | "both"): string {
  return path.join(SPECS_DIR, platform === "both" ? "android" : platform);
}

export function sanitizeFileName(name: string): string {
  return name
    .replace(/[^a-zA-Z0-9_ ]/g, "")
    .replace(/\s+/g, "_")
    .slice(0, 80);
}

export function buildSpecContent(
  testCase: ZephyrTestCaseFull,
  generatedCode: string
): string {
  const header = `// Auto-generated from ${testCase.testCase.key} - ${testCase.testCase.name}
// Do not edit manually. Regenerate via "npm run generate:tests".
// Platform: ${testCase.platform}

`;

  return header + generatedCode;
}

export async function writeSpecFile(
  testCase: ZephyrTestCaseFull,
  generatedCode: string
): Promise<string> {
  const platformDir = getPlatformDir(testCase.platform);
  await fs.mkdir(platformDir, { recursive: true });

  const fileName = `${sanitizeFileName(testCase.testCase.key)}_${sanitizeFileName(
    testCase.testCase.name
  )}.spec.ts`;
  const filePath = path.join(platformDir, fileName);

  const content = buildSpecContent(testCase, generatedCode);
  await fs.writeFile(filePath, content, "utf-8");

  logger.info({ filePath }, "Wrote test spec");

  return filePath;
}
