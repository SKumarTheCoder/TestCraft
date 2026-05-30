import type { Options } from "@wdio/types";
import { config } from "dotenv";

config();

const BROWSERSTACK_USERNAME = process.env.BROWSERSTACK_USERNAME ?? "";
const BROWSERSTACK_ACCESS_KEY = process.env.BROWSERSTACK_ACCESS_KEY ?? "";
const BROWSERSTACK_APP_ID = process.env.BROWSERSTACK_APP_ID ?? "";

export const config: Options.Testrunner = {
  runner: "local",
  autoCompileOpts: {
    autoCompile: true,
    tsNodeOpts: {
      transpileOnly: true,
      project: "./tsconfig.json",
    },
  },

  specs: ["./src/runner/specs/android/**/*.spec.ts"],

  capabilities: [
    {
      platformName: "Android",
      "appium:deviceName": "Samsung Galaxy S24",
      "appium:platformVersion": "14.0",
      "appium:automationName": "UiAutomator2",
      "appium:app": BROWSERSTACK_APP_ID,
      "appium:newCommandTimeout": 300,
      "appium:autoGrantPermissions": true,
      "appium:autoAcceptAlerts": true,
      "bstack:options": {
        userName: BROWSERSTACK_USERNAME,
        accessKey: BROWSERSTACK_ACCESS_KEY,
        projectName: "Mobile Test Automation",
        buildName: `Android Nightly ${new Date().toISOString().slice(0, 10)}`,
        debug: true,
        networkLogs: true,
        deviceLogs: true,
        appiumVersion: "2.0.0",
      },
    },
  ],

  logLevel: "info",
  waitforTimeout: 15000,
  connectionRetryTimeout: 120000,
  connectionRetryCount: 2,

  framework: "mocha",
  mochaOpts: {
    ui: "bdd",
    timeout: 120000,
    retries: 1,
  },

  reporters: ["spec"],

  services: [
    [
      "browserstack",
      {
        browserstackLocal: false,
      },
    ],
  ],

  onPrepare: function () {
    console.log("Starting Android test run on BrowserStack...");
  },

  onComplete: function () {
    console.log("Android test run completed.");
  },
};
