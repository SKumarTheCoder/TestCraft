/**
 * Base screen page object with shared helper methods.
 * All screen page objects should extend this class.
 */
export default class BaseScreen {
  protected selector: string;

  constructor(selector: string) {
    this.selector = selector;
  }

  async open(): Promise<void> {
    await driver.pause(500);
  }

  async waitForDisplayed(
    element: WebdriverIO.Element,
    timeout = 15000
  ): Promise<void> {
    await element.waitForDisplayed({ timeout });
  }

  async waitForClickable(
    element: WebdriverIO.Element,
    timeout = 15000
  ): Promise<void> {
    await element.waitForClickable({ timeout });
  }

  async tap(element: WebdriverIO.Element): Promise<void> {
    await this.waitForClickable(element);
    await element.click();
  }

  async typeText(
    element: WebdriverIO.Element,
    text: string
  ): Promise<void> {
    await this.waitForDisplayed(element);
    await element.click();
    await element.clearValue();
    await element.setValue(text);
  }

  async takeScreenshot(name: string): Promise<void> {
    await driver.saveScreenshot(`./test-results/screenshots/${name}.png`);
  }

  async scrollToElement(element: WebdriverIO.Element): Promise<void> {
    await element.scrollIntoView();
  }

  async getText(element: WebdriverIO.Element): Promise<string> {
    await this.waitForDisplayed(element);
    return element.getText();
  }

  async isDisplayed(element: WebdriverIO.Element): Promise<boolean> {
    try {
      await element.waitForDisplayed({ timeout: 3000 });
      return true;
    } catch {
      return false;
    }
  }

  async scrollDown(): Promise<void> {
    const { width, height } = await driver.getWindowSize();
    const startX = width / 2;
    const startY = height * 0.8;
    const endY = height * 0.2;
    await driver.touchPerform([
      { action: "press", options: { x: startX, y: startY } },
      {
        action: "wait",
        options: { ms: 500 },
      },
      {
        action: "moveTo",
        options: { x: startX, y: endY },
      },
      { action: "release" },
    ]);
  }
}
