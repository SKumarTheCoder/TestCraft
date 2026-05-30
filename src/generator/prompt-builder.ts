import { ZephyrTestCaseFull } from "./zephyr-client.js";

const SYSTEM_PROMPT = `You are a senior mobile QA engineer who writes Appium + WebdriverIO test scripts in TypeScript.

## Guidelines
- Use WebdriverIO v9 with Mocha framework and Chai assertions
- Prefer accessibilityID locators (maps to React Native's accessibilityLabel / testID)
- Fall back to XPath with class+text only when no accessibilityID exists
- Wrap assertions in browser.waitUntil() for stability
- Use Page Object pattern: each screen gets a class in pageobjects/
- Import page objects from "../../pageobjects/"
- Export a describe block with the test case name
- Use async/await throughout
- Log meaningful messages on success and failure
- Add @tag annotations matching the test case key (e.g., @C12345)

## Example Output

import LoginScreen from "../../pageobjects/LoginScreen.js";

describe("Login with valid credentials @C12345", () => {
  it("should log in successfully with valid email and password", async () => {
    await LoginScreen.open();
    await LoginScreen.enterEmail("test@user.com");
    await LoginScreen.enterPassword("TestPass123");
    await LoginScreen.tapSignIn();

    await expect(LoginScreen.dashboardHeader).toBeDisplayed();
  });
});

## React Native Specifics
- testID prop on React Native components maps to accessibility-id in Appium
- Use $("~testID_value") to locate by testID / accessibilityID
- For accessibilityLabel, use $("~label_text")
- WebdriverIO automatically waits for elements (waitforTimeout: 15000)
`;

function buildStepText(
  steps: { index: number; description: string; expectedResult: string; data?: string }[]
): string {
  return steps
    .map(
      (s) =>
        `  Step ${s.index}: ${s.description}
  Expected: ${s.expectedResult}${s.data ? `\n  Test data: ${s.data}` : ""}`
    )
    .join("\n\n");
}

export function buildGenerationPrompt(testCase: ZephyrTestCaseFull): {
  system: string;
  user: string;
} {
  const userPrompt = `Generate a WebdriverIO test script for the following test case.

Test Case Key: ${testCase.testCase.key}
Name: ${testCase.testCase.name}
Objective: ${testCase.testCase.objective}
Platform: ${testCase.platform}
Priority: ${testCase.testCase.priority ?? "medium"}

Test Steps:
${buildStepText(testCase.steps)}

Generate only the TypeScript code. No explanation.`;

  return { system: SYSTEM_PROMPT, user: userPrompt };
}

export function buildFixPrompt(
  testFilePath: string,
  originalCode: string,
  errorMessage: string,
  pageSource?: string
): { system: string; user: string } {
  const systemFix = `You are an expert at fixing broken Appium tests. 
Given the test code, failure error, and page source, suggest the minimal fix needed.
Output ONLY the corrected TypeScript code for the failing test.`;

  const userFix = `Test file: ${testFilePath}

Original code:
\`\`\`typescript
${originalCode}
\`\`\`

Error:
${errorMessage}

${pageSource ? `Page source at failure:\n${pageSource.slice(0, 5000)}` : ""}

Fix the test code. Output only the corrected TypeScript.`;

  return { system: systemFix, user: userFix };
}
