import { config } from "dotenv";
import { logger } from "../../shared/logger.js";

config();

interface BrowserStackSession {
  id: string;
  name: string;
  status: "passed" | "failed" | "error" | "timeout";
  device: string;
  os: string;
  os_version: string;
  duration: number;
  reason?: string;
  logs_url?: string;
  video_url?: string;
  appium_logs_url?: string;
  browser_url?: string;
}

interface BuildDetail {
  id: string;
  name: string;
  status: "running" | "done" | "failed";
  duration: number;
}

function authHeader(): string {
  const username = process.env.BROWSERSTACK_USERNAME;
  const accessKey = process.env.BROWSERSTACK_ACCESS_KEY;
  if (!username || !accessKey) {
    throw new Error("BrowserStack credentials not configured");
  }
  const encoded = Buffer.from(`${username}:${accessKey}`).toString("base64");
  return `Basic ${encoded}`;
}

async function browserStackRequest<T>(
  path: string
): Promise<T> {
  const url = `https://api-cloud.browserstack.com/app-automate${path}`;
  const response = await fetch(url, {
    headers: { Authorization: authHeader() },
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(
      `BrowserStack API error ${response.status}: ${body}`
    );
  }

  return response.json() as Promise<T>;
}

export async function getBuilds(limit = 10): Promise<BuildDetail[]> {
  const result = await browserStackRequest<{ builds: BuildDetail[] }>(
    `/builds.json?limit=${limit}`
  );
  return result.builds ?? [];
}

export async function getSessions(
  buildId: string
): Promise<BrowserStackSession[]> {
  const result = await browserStackRequest<{ sessions: BrowserStackSession[] }>(
    `/builds/${buildId}/sessions.json`
  );
  return result.sessions ?? [];
}

export async function pollSessions(
  buildId: string,
  intervalMs = 10000,
  timeoutMs = 600000
): Promise<BrowserStackSession[]> {
  const start = Date.now();

  while (Date.now() - start < timeoutMs) {
    const sessions = await getSessions(buildId);
    const allDone = sessions.every(
      (s) => s.status !== "running" && s.status !== "timeout"
    );

    if (allDone) {
      logger.info(
        { total: sessions.length },
        "All sessions completed"
      );
      return sessions;
    }

    logger.info(
      {
        done: sessions.filter((s) => s.status !== "running").length,
        total: sessions.length,
      },
      "Waiting for sessions to complete..."
    );

    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }

  throw new Error(
    `Timed out waiting for build ${buildId} to complete after ${timeoutMs}ms`
  );
}

export async function getSessionLogs(
  sessionId: string
): Promise<string> {
  return browserStackRequest<string>(`/sessions/${sessionId}/logs`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const buildId = process.argv[2];
  if (!buildId) {
    console.error("Usage: poll-results.ts <buildId>");
    process.exit(1);
  }

  pollSessions(buildId)
    .then((sessions) => console.log(JSON.stringify(sessions, null, 2)))
    .catch((err) => {
      console.error(err.message);
      process.exit(1);
    });
}
