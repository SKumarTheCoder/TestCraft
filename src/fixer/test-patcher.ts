import * as fs from "node:fs/promises";
import { logger } from "../shared/logger.js";
import { callLlm } from "../shared/llm-client.js";
import { FailureAnalysis } from "./failure-analyzer.js";
import { buildFixPrompt } from "./fix-prompt.js";

export interface FixResult {
  testFile: string;
  success: boolean;
  appliedFix: boolean;
  newCode?: string;
  error?: string;
}

export async function applyFix(
  analysis: FailureAnalysis
): Promise<FixResult> {
  logger.info({ testFile: analysis.testFile }, "Attempting auto-fix");

  try {
    const { system, user } = buildFixPrompt(analysis);

    const response = await callLlm(system, user, "fix");

    let fixedCode = response.content;

    // Strip markdown code fences if present
    fixedCode = fixedCode.replace(/^```typescript\s*\n?/gm, "").replace(/^```\s*\n?/gm, "");
    fixedCode = fixedCode.trim();

    if (!fixedCode || fixedCode.length < 10) {
      return {
        testFile: analysis.testFile,
        success: false,
        appliedFix: false,
        error: "LLM returned empty or invalid fix",
      };
    }

    // Write the fixed code
    await fs.writeFile(analysis.testFile, fixedCode, "utf-8");

    logger.info(
      { testFile: analysis.testFile, model: response.model },
      "Fix applied successfully"
    );

    return {
      testFile: analysis.testFile,
      success: true,
      appliedFix: true,
      newCode: fixedCode,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error({ testFile: analysis.testFile, error: message }, "Fix failed");

    return {
      testFile: analysis.testFile,
      success: false,
      appliedFix: false,
      error: message,
    };
  }
}
