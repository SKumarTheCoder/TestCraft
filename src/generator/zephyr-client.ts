import { config } from "dotenv";
import { logger } from "../shared/logger.js";

config();

export interface ZephyrTestCase {
  key: string;
  name: string;
  objective: string;
  folder?: string;
  priority?: string;
  status?: string;
}

export interface ZephyrTestStep {
  index: number;
  description: string;
  expectedResult: string;
  data?: string;
}

export interface ZephyrTestCaseFull {
  testCase: ZephyrTestCase;
  steps: ZephyrTestStep[];
  platform: "android" | "ios" | "both";
}

interface ZephyrConfig {
  baseUrl: string;
  email: string;
  apiToken: string;
  projectKey: string;
}

function getConfig(): ZephyrConfig {
  const baseUrl = process.env.JIRA_BASE_URL;
  const email = process.env.JIRA_EMAIL;
  const apiToken = process.env.JIRA_API_TOKEN;
  const projectKey = process.env.ZEPHYR_PROJECT_KEY;

  if (!baseUrl || !email || !apiToken || !projectKey) {
    throw new Error(
      "Missing Zephyr config. Set JIRA_BASE_URL, JIRA_EMAIL, JIRA_API_TOKEN, ZEPHYR_PROJECT_KEY in .env"
    );
  }

  return { baseUrl, email, apiToken, projectKey };
}

function authHeader(config: ZephyrConfig): string {
  const encoded = Buffer.from(`${config.email}:${config.apiToken}`).toString(
    "base64"
  );
  return `Basic ${encoded}`;
}

async function zephyrRequest<T>(
  path: string,
  params?: Record<string, string>
): Promise<T> {
  const cfg = getConfig();
  const url = new URL(
    `${cfg.baseUrl}/rest/atm/1.0/${path.replace(/^\//, "")}`
  );
  if (params) {
    for (const [key, value] of Object.entries(params)) {
      url.searchParams.set(key, value);
    }
  }

  logger.info({ url: url.toString() }, "Fetching from Zephyr");

  const response = await fetch(url.toString(), {
    headers: {
      Authorization: authHeader(cfg),
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(
      `Zephyr API error: ${response.status} ${response.statusText}\n${body}`
    );
  }

  return response.json() as Promise<T>;
}

export async function listTestCases(): Promise<ZephyrTestCase[]> {
  const projectKey = getConfig().projectKey;
  const result = await zephyrRequest<{ values: ZephyrTestCase[] }>(
    "testcase/search",
    {
      query: `projectKey = "${projectKey}"`,
      maxResults: "200",
    }
  );

  return result.values ?? [];
}

export async function getTestSteps(
  testCaseKey: string
): Promise<ZephyrTestStep[]> {
  const result = await zephyrRequest<ZephyrTestStep[]>(
    `testcase/${testCaseKey}/teststep`
  );
  return result ?? [];
}

export async function getTestCasesWithSteps(
  platform?: "android" | "ios" | "both"
): Promise<ZephyrTestCaseFull[]> {
  const cases = await listTestCases();
  logger.info({ count: cases.length }, "Fetched test cases from Zephyr");

  const full: ZephyrTestCaseFull[] = [];

  for (const tc of cases) {
    const steps = await getTestSteps(tc.key);
    const detectedPlatform = inferPlatform(tc, steps, platform);

    full.push({
      testCase: tc,
      steps,
      platform: detectedPlatform,
    });
  }

  return full;
}

function inferPlatform(
  tc: ZephyrTestCase,
  _steps: ZephyrTestStep[],
  explicit?: "android" | "ios" | "both"
): "android" | "ios" | "both" {
  if (explicit) return explicit;

  const text = `${tc.name} ${tc.objective} ${tc.folder ?? ""}`.toLowerCase();
  if (text.includes("ios") || text.includes("iphone") || text.includes("ipad"))
    return "ios";
  if (
    text.includes("android") ||
    text.includes("pixel") ||
    text.includes("galaxy")
  )
    return "android";

  return "both";
}
