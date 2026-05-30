import { config } from "dotenv";
import { logger } from "../../shared/logger.js";
import * as fs from "node:fs";

config();

interface UploadResponse {
  app_url?: string;
  error?: string;
}

export async function uploadApp(
  platform: "android" | "ios",
  appPath: string
): Promise<string> {
  const username = process.env.BROWSERSTACK_USERNAME;
  const accessKey = process.env.BROWSERSTACK_ACCESS_KEY;

  if (!username || !accessKey) {
    throw new Error(
      "BrowserStack credentials not configured. Set BROWSERSTACK_USERNAME and BROWSERSTACK_ACCESS_KEY."
    );
  }

  if (!fs.existsSync(appPath)) {
    throw new Error(`App file not found: ${appPath}`);
  }

  const url = "https://api-cloud.browserstack.com/app-automate/upload";
  const auth = Buffer.from(`${username}:${accessKey}`).toString("base64");

  logger.info({ platform, appPath }, "Uploading app to BrowserStack");

  const formData = new FormData();
  const fileBlob = new Blob([fs.readFileSync(appPath)]);
  const ext = platform === "android" ? "apk" : "ipa";
  formData.append("file", fileBlob, `app.${ext}`);

  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Basic ${auth}`,
    },
    body: formData,
  });

  const result = (await response.json()) as UploadResponse;

  if (!response.ok || result.error) {
    throw new Error(
      `BrowserStack upload failed: ${result.error ?? response.statusText}`
    );
  }

  logger.info({ appUrl: result.app_url }, "App uploaded successfully");
  return result.app_url!;
}

async function main() {
  const args = process.argv.slice(2);
  const platformIdx = args.indexOf("--platform");
  const pathIdx = args.indexOf("--app-path");

  if (platformIdx === -1 || pathIdx === -1) {
    console.error("Usage: upload.ts --platform <android|ios> --app-path <path>");
    process.exit(1);
  }

  const platform = args[platformIdx + 1] as "android" | "ios";
  const appPath = args[pathIdx + 1];
  const appId = await uploadApp(platform, appPath);
  console.log(appId);
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
