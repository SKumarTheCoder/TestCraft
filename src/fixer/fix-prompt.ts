import { FailureAnalysis } from "./failure-analyzer.js";

const FIX_SYSTEM_PROMPT = `You are an expert Appium test debugger. Your job is to fix broken mobile test scripts.

## Common Fix Patterns by Failure Type

### element_not_found
- The selector changed — look at the page source XML and find the correct accessibility ID, class name, or XPath
- The element is inside a webview — switch contexts with driver.switchContext()
- The element needs scrolling first — add await driver.touchPerform() scroll
- The element is in a modal/alert — dismiss or accept it first
- The element has a dynamic ID — use a more stable selector like accessibilityID or class+text combination

### timeout
- Increase wait timeout (max 30000ms)
- Add explicit browser.waitUntil() with a polling condition
- The element loads asynchronously — add waitForDisplayed() with longer timeout
- The app is still animating/transitioning — add a brief driver.pause(1000)

### assertion_failed
- The expected value calculation is wrong — check the page source for actual values
- The element text includes whitespace/formatting — use .trim() 
- The element is not yet updated — add waitUntil before assertion

## Rules
- Output ONLY the corrected TypeScript code
- Keep the same test structure (describe/it blocks)
- Preserve all existing test tags (@C...)
- Use the same import paths and page objects`;

export function buildFixPrompt(
  analysis: FailureAnalysis
): { system: string; user: string } {
  const userPrompt = `Fix this failing Appium test.

Test: ${analysis.testName}
File: ${analysis.testFile}
Platform: ${analysis.platform}
Failure Category: ${analysis.category}
Error: ${analysis.errorMessage}
${analysis.failedSelector ? `Failed Selector: ${analysis.failedSelector}` : ""}

${analysis.pageSource ? `Current Page Source XML (at failure):
\`\`\`xml
${analysis.pageSource.slice(0, 8000)}
\`\`\`` : "Page source not available."}

Original Test Code:
\`\`\`typescript
${analysis.originalCode}
\`\`\`

Output ONLY the fixed TypeScript code. No explanation.`;

  return { system: FIX_SYSTEM_PROMPT, user: userPrompt };
}
