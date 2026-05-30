import { config } from "dotenv";
config();

import * as fs from "node:fs/promises";
import { getTestCasesWithSteps } from "../src/generator/zephyr-client.js";
import { buildGenerationPrompt } from "../src/generator/prompt-builder.js";
import { callLlm } from "../src/shared/llm-client.js";
import { writeSpecFile } from "../src/generator/test-writer.js";
import { logger } from "../src/shared/logger.js";
import { validatePlatform } from "./validate-tests.js";

async function main() {
  const platform = (process.env.TARGET_PLATFORM ?? "both") as
    | "android"
    | "ios"
    | "both";

  const shouldValidate = process.env.VALIDATE_GENERATED_TESTS === "true";
  const resultsDir = process.env.TEST_RESULTS_DIR ?? "./test-results";

  logger.info({ platform, shouldValidate }, "Starting test generation");

  const testCases = await getTestCasesWithSteps(platform);
  logger.info({ count: testCases.length }, "Fetched test cases with steps");

  if (testCases.length === 0) {
    logger.warn("No test cases found. Check your Zephyr project key.");
    process.exit(0);
  }

  let generated = 0;
  let failed = 0;

  for (const tc of testCases) {
    try {
      logger.info(
        { key: tc.testCase.key, name: tc.testCase.name },
        "Generating test"
      );

      const { system, user } = buildGenerationPrompt(tc);
      const response = await callLlm(system, user, "generation");

      await writeSpecFile(tc, response.content);
      generated++;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.error(
        { key: tc.testCase.key, error: message },
        "Failed to generate test"
      );
      failed++;
    }
  }

  logger.info(
    { generated, failed, total: testCases.length },
    "Test generation complete"
  );

  if (failed > 0 && !shouldValidate) {
    process.exit(1);
  }

  if (shouldValidate) {
    logger.info("Validation enabled — running generated tests on BrowserStack");

    await fs.mkdir(resultsDir, { recursive: true });

    const platforms = platform === "both" ? ["android", "ios"] as const : [platform];
    let allValidated = true;

    for (const p of platforms) {
      const result = await validatePlatform(p, resultsDir);
      if (!result.passed) {
        allValidated = false;
        logger.error(
          { platform: p, attempts: result.attempts, passedTests: result.passedTests, failedTests: result.failedTests },
          "Platform validation failed after all retries"
        );
      }
    }

    if (!allValidated) {
      logger.error("Test generation completed but validation failed for some platforms");
      process.exit(1);
    }

    logger.info("All generated tests validated successfully on BrowserStack");
  }
}

main().catch((err) => {
  logger.error(err, "Test generation failed");
  process.exit(1);
});
