import { config } from "dotenv";
config();

import { getTestCasesWithSteps } from "../src/generator/zephyr-client.js";
import { buildGenerationPrompt } from "../src/generator/prompt-builder.js";
import { callLlm } from "../src/shared/llm-client.js";
import { writeSpecFile } from "../src/generator/test-writer.js";
import { logger } from "../src/shared/logger.js";

async function main() {
  const platform = (process.env.TARGET_PLATFORM ?? "both") as
    | "android"
    | "ios"
    | "both";

  logger.info({ platform }, "Starting test generation");

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

  if (failed > 0) {
    process.exit(1);
  }
}

main().catch((err) => {
  logger.error(err, "Test generation failed");
  process.exit(1);
});
