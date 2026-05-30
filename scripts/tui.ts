import { config } from "dotenv";
config();

import * as fs from "node:fs";
import * as path from "node:path";
import { execSync, spawn } from "node:child_process";
import blessed from "neo-blessed";

const RESULTS_DIR = process.env.TEST_RESULTS_DIR ?? "./test-results";

interface ValidationResult {
  platform: "android" | "ios";
  passed: boolean;
  attempts: number;
  totalTests: number;
  passedTests: number;
  failedTests: number;
}

interface WdioStats {
  passed: number;
  failed: number;
  skipped: number;
  total?: number;
}

interface WdioReport {
  stats?: WdioStats;
  results: { title: string; state: string; duration?: number }[];
}

interface HistoryEntry {
  file: string;
  timestamp: string;
  label: string;
}

function readJson<T>(filePath: string): T | null {
  try {
    const content = fs.readFileSync(filePath, "utf-8");
    return JSON.parse(content) as T;
  } catch {
    return null;
  }
}

function getLastValidation(): { android: ValidationResult | null; ios: ValidationResult | null } {
  const results = readJson<ValidationResult[]>(
    path.join(RESULTS_DIR, "validation-results.json")
  );
  if (!results) return { android: null, ios: null };
  const android = results.find((r) => r.platform === "android") ?? null;
  const ios = results.find((r) => r.platform === "ios") ?? null;
  return { android, ios };
}

function getLastWdioReport(): WdioReport | null {
  return readJson<WdioReport>(path.join(RESULTS_DIR, "wdio-report.json"));
}

function getHistoryEntries(): HistoryEntry[] {
  const dir = path.resolve(RESULTS_DIR);
  const files: HistoryEntry[] = [];
  try {
    const entries = fs.readdirSync(dir, { recursive: true }) as string[];
    for (const entry of entries) {
      if (!entry.endsWith("-results.json") && entry !== "validation-results.json") continue;
      const fullPath = path.join(dir, entry);
      const stat = fs.statSync(fullPath);
      files.push({
        file: entry,
        timestamp: stat.mtime.toISOString(),
        label: entry.replace(".json", "").replace(/-/g, " "),
      });
    }
  } catch {}
  files.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
  return files.slice(0, 10);
}

function runCommand(cmd: string, logCallback: (line: string) => void): void {
  logCallback(`\n── Starting: ${cmd} ──`);
  const child = spawn(cmd, [], {
    shell: true,
    cwd: process.cwd(),
    stdio: ["ignore", "pipe", "pipe"],
  });

  child.stdout?.on("data", (data: Buffer) => {
    for (const line of data.toString().split("\n").filter(Boolean)) {
      logCallback(`  ${line}`);
    }
  });

  child.stderr?.on("data", (data: Buffer) => {
    for (const line of data.toString().split("\n").filter(Boolean)) {
      logCallback(`  ${line}`);
    }
  });

  child.on("exit", (code) => {
    logCallback(`── Exit code: ${code} ──`);
  });
}

const screen = blessed.screen({
  smartCSR: true,
  title: "TestCraft TUI",
  dockBorders: true,
  fullUnicode: true,
  autoPadding: true,
  terminal: process.env.TERM || "xterm-256color",
});

screen.key(["q", "C-c"], () => process.exit(0));

// ── Header ──
const header = blessed.box({
  top: 0,
  left: 0,
  width: "100%",
  height: 1,
  content: " TestCraft TUI  {bold}{cyan-fg}[q]{/} Quit  {bold}{cyan-fg}[r]{/} Refresh  {bold}{cyan-fg}[1-6]{/} Actions",
  tags: true,
  style: { fg: "white", bg: "blue" },
});
screen.append(header);

// ── Status Boxes ──
const statusY = 1;
const statusH = 4;

const androidBox = blessed.box({
  top: statusY,
  left: 0,
  width: "33%",
  height: statusH,
  label: " Android ",
  border: { type: "line" },
  style: { border: { fg: "green" } },
  tags: true,
  padding: { left: 1, right: 1 },
});
screen.append(androidBox);

const iosBox = blessed.box({
  top: statusY,
  left: "33%",
  width: "34%",
  height: statusH,
  label: " iOS ",
  border: { type: "line" },
  style: { border: { fg: "green" } },
  tags: true,
  padding: { left: 1, right: 1 },
});
screen.append(iosBox);

const summaryBox = blessed.box({
  top: statusY,
  left: "67%",
  width: "33%",
  height: statusH,
  label: " Summary ",
  border: { type: "line" },
  style: { border: { fg: "cyan" } },
  tags: true,
  padding: { left: 1, right: 1 },
});
screen.append(summaryBox);

// ── History Table ──
const historyY = statusY + statusH;
const historyH = 6;

const historyBox = blessed.list({
  top: historyY,
  left: 0,
  width: "60%",
  height: historyH,
  label: " Recent Results ",
  border: { type: "line" },
  style: {
    border: { fg: "white" },
    selected: { bg: "blue" },
    item: { fg: "white" },
  },
  tags: true,
  keys: true,
  vi: true,
  items: ["(no results yet)"],
});
screen.append(historyBox);

// ── Actions Menu ──
const actionsBox = blessed.box({
  top: historyY,
  left: "60%",
  width: "40%",
  height: historyH,
  label: " Actions ",
  border: { type: "line" },
  style: { border: { fg: "yellow" } },
  tags: true,
  padding: { left: 1, right: 1 },
  content: [
    "{bold}{yellow-fg}[1]{/} Generate Tests{/}",
    "{bold}{yellow-fg}[2]{/} Run Android{/}",
    "{bold}{yellow-fg}[3]{/} Run iOS{/}",
    "{bold}{yellow-fg}[4]{/} Validate All{/}",
    "{bold}{yellow-fg}[5]{/} Auto-Fix{/}",
    "{bold}{yellow-fg}[6]{/} Slack Report{/}",
  ].join("\n"),
});
screen.append(actionsBox);

// ── Log Area ──
const logY = historyY + historyH;
const logH = "100%-" + (logY + 1);

const logBox = blessed.box({
  top: logY,
  left: 0,
  width: "100%",
  height: logH,
  label: " Log ",
  border: { type: "line" },
  style: { border: { fg: "white" } },
  tags: true,
  scrollable: true,
  alwaysScroll: true,
  scrollbar: { ch: "│", track: { style: { fg: "blue" } } },
  padding: { left: 1, right: 1 },
});
screen.append(logBox);

// ── Footer ──
const footer = blessed.box({
  bottom: 0,
  left: 0,
  width: "100%",
  height: 1,
  content: " Ready ",
  style: { fg: "white", bg: "blue" },
});
screen.append(footer);

function setFooter(msg: string): void {
  footer.setContent(` ${msg} `);
  screen.render();
}

function log(msg: string): void {
  const current = logBox.getContent();
  const lines = current.split("\n").filter(Boolean);
  lines.push(msg);
  if (lines.length > 500) lines.splice(0, lines.length - 500);
  logBox.setContent(lines.join("\n"));
  logBox.setScrollPerc(100);
  screen.render();
}

function updateDashboard(): void {
  const val = getLastValidation();

  // Android
  if (val.android) {
    const r = val.android;
    const icon = r.passed ? "{green-fg}✅{/}" : "{red-fg}❌{/}";
    androidBox.setContent(
      `Status: ${icon}\nPass: {green-fg}${r.passedTests}{/}/{bold}${r.totalTests}{/}\nAttempts: ${r.attempts}`
    );
    androidBox.style.border.fg = r.passed ? "green" : "red";
  } else {
    androidBox.setContent("Status: {yellow-fg}──{/}\nNo runs yet");
    androidBox.style.border.fg = "yellow";
  }

  // iOS
  if (val.ios) {
    const r = val.ios;
    const icon = r.passed ? "{green-fg}✅{/}" : "{red-fg}❌{/}";
    iosBox.setContent(
      `Status: ${icon}\nPass: {green-fg}${r.passedTests}{/}/{bold}${r.totalTests}{/}\nAttempts: ${r.attempts}`
    );
    iosBox.style.border.fg = r.passed ? "green" : "red";
  } else {
    iosBox.setContent("Status: {yellow-fg}──{/}\nNo runs yet");
    iosBox.style.border.fg = "yellow";
  }

  // Summary
  const report = getLastWdioReport();
  if (report?.stats) {
    const s = report.stats;
    const total = s.total ?? (s.passed + s.failed + s.skipped);
    const rate = total > 0 ? ((s.passed / total) * 100).toFixed(1) : "0.0";
    summaryBox.setContent(
      `Total: {bold}${total}{/}\nPassed: {green-fg}${s.passed}{/}\nFailed: {red-fg}${s.failed}{/}\nRate: {cyan-fg}${rate}%{/}`
    );
  } else {
    summaryBox.setContent("No recent test run");
  }

  // History list
  const history = getHistoryEntries();
  if (history.length > 0) {
    const items = history.map(
      (h) =>
        `${h.timestamp.slice(0, 19).replace("T", " ")}  ${h.label}`
    );
    historyBox.setItems(items);
  }

  screen.render();
}

// ── Key Bindings ──
screen.key("r", () => {
  setFooter("Refreshing...");
  updateDashboard();
  setFooter("Ready");
});

screen.key("1", () => {
  setFooter("Running: npm run generate:tests ...");
  runCommand("npm run generate:tests", log);
  setFooter("Ready — refresh with [r]");
});

screen.key("2", () => {
  setFooter("Running: npm run test:android ...");
  runCommand("npm run test:android", log);
  setFooter("Ready — refresh with [r]");
});

screen.key("3", () => {
  setFooter("Running: npm run test:ios ...");
  runCommand("npm run test:ios", log);
  setFooter("Ready — refresh with [r]");
});

screen.key("4", () => {
  setFooter("Running: npm run validate:tests ...");
  runCommand("npm run validate:tests", log);
  setFooter("Ready — refresh with [r]");
});

screen.key("5", () => {
  setFooter("Running: npm run fix ...");
  runCommand("npm run fix", log);
  setFooter("Ready — refresh with [r]");
});

screen.key("6", () => {
  setFooter("Running: npm run report:slack ...");
  runCommand("npm run report:slack", log);
  setFooter("Ready — refresh with [r]");
});

// ── Init ──
updateDashboard();
log("TestCraft TUI started. Press [q] to quit, [r] to refresh.");
log(`Watching: ${path.resolve(RESULTS_DIR)}`);

// Auto-refresh every 10 seconds
setInterval(updateDashboard, 10000);

screen.render();
