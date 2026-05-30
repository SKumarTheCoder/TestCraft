import { config } from "dotenv";
import { ReportPayload, TestResult, FixResult } from "./build-report.js";
import { logger } from "../shared/logger.js";

config();

function statusEmoji(status: string): string {
  switch (status) {
    case "passed":
      return ":white_check_mark:";
    case "failed":
      return ":x:";
    case "skipped":
      return ":fast_forward:";
    default:
      return ":question:";
  }
}

function buildSummaryBlocks(report: ReportPayload) {
  const { summary } = report;
  const overall =
    summary.failed === 0
      ? ":large_green_circle: All tests passed"
      : ":red_circle: Some tests failed";

  return [
    {
      type: "header",
      text: {
        type: "plain_text",
        text: `${overall} — Nightly Test Run #${report.runId.slice(0, 8)}`,
        emoji: true,
      },
    },
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: [
          `*Branch:* \`${report.branch}\``,
          `*Environment:* ${report.environment}`,
          `*Duration:* ${(report.duration / 1000).toFixed(1)}s`,
        ].join("\n"),
      },
    },
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: [
          `*Results*`,
          `${statusEmoji("passed")} Passed: *${summary.passed}*`,
          `${statusEmoji("failed")} Failed: *${summary.failed}*`,
          `${statusEmoji("skipped")} Skipped: *${summary.skipped}*`,
          `Total: *${summary.total}*`,
        ].join("  |  "),
      },
    },
    { type: "divider" },
  ];
}

function buildFailedTestBlocks(failedTests: TestResult[]) {
  if (failedTests.length === 0) return [];

  const blocks: any[] = [
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `*Failed Tests (${failedTests.length})*`,
      },
    },
  ];

  for (const test of failedTests.slice(0, 10)) {
    const lines = [
      `${statusEmoji("failed")} \`${test.testName}\``,
    ];
    if (test.error) {
      lines.push(
        `   → ${test.error.slice(0, 200)}`
      );
    }
    const links: string[] = [];
    if (test.logsUrl) links.push(`<${test.logsUrl}|View Log>`);
    if (test.videoUrl) links.push(`<${test.videoUrl}|View Video>`);
    if (links.length) lines.push(`   ${links.join(" · ")}`);

    blocks.push({
      type: "section",
      text: { type: "mrkdwn", text: lines.join("\n") },
    });
  }

  if (failedTests.length > 10) {
    blocks.push({
      type: "context",
      elements: [
        {
          type: "mrkdwn",
          text: `...and ${failedTests.length - 10} more failures`,
        },
      ],
    });
  }

  blocks.push({ type: "divider" });
  return blocks;
}

function buildAutoFixBlocks(fixes: FixResult[]) {
  if (fixes.length === 0) return [];

  const blocks: any[] = [
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: "*Auto-Fix Results*",
      },
    },
  ];

  for (const fix of fixes.slice(0, 5)) {
    const icon = fix.fixed
      ? ":wrench:"
      : ":warning:";
    const msg = fix.fixed
      ? `\`${fix.testName}\` — fix applied successfully`
      : `\`${fix.testName}\` — fix failed: ${fix.error?.slice(0, 100)}`;

    blocks.push({
      type: "section",
      text: { type: "mrkdwn", text: `${icon} ${msg}` },
    });
  }

  blocks.push({ type: "divider" });
  return blocks;
}

function buildActionBlocks(runId: string): any[] {
  return [
    {
      type: "actions",
      elements: [
        {
          type: "button",
          text: {
            type: "plain_text",
            text: ":arrows_counterclockwise: Rerun Failed",
            emoji: true,
          },
          url: `https://github.com/${process.env.GITHUB_REPOSITORY}/actions/runs/${runId}`,
          style: "primary",
        },
        {
          type: "button",
          text: {
            type: "plain_text",
            text: ":bar_chart: Full Report",
            emoji: true,
          },
          url: `https://github.com/${process.env.GITHUB_REPOSITORY}/actions/runs/${runId}`,
        },
      ],
    },
  ];
}

export async function sendSlackReport(
  report: ReportPayload
): Promise<void> {
  const webhookUrl = process.env.SLACK_WEBHOOK_URL;
  if (!webhookUrl) {
    logger.warn("SLACK_WEBHOOK_URL not set — skipping Slack notification");
    return;
  }

  const failedTests = report.results.filter((r) => r.status === "failed");
  const blocks = [
    ...buildSummaryBlocks(report),
    ...buildFailedTestBlocks(failedTests),
    ...buildAutoFixBlocks(report.fixes),
    ...buildActionBlocks(report.runId),
  ];

  const payload = { blocks };

  logger.info({ blockCount: blocks.length }, "Sending Slack notification");

  const response = await fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Slack webhook error: ${response.status} ${body}`);
  }

  logger.info("Slack notification sent successfully");
}
