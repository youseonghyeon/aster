import { beforeAll, describe, expect, it, vi } from "vitest";

let appStyles = "";

beforeAll(async () => {
  const { readFileSync } = await vi.importActual<{
    readFileSync: (path: string, encoding: "utf8") => string;
  }>("node:fs");
  appStyles = readFileSync("src/app/App.css", "utf8");
});

function cssRule(selector: string) {
  const ruleStart = appStyles.indexOf(`${selector} {`);
  const bodyStart = appStyles.indexOf("{", ruleStart) + 1;
  const bodyEnd = appStyles.indexOf("}", bodyStart);

  expect(ruleStart, `missing CSS rule: ${selector}`).toBeGreaterThanOrEqual(0);
  expect(bodyEnd, `unclosed CSS rule: ${selector}`).toBeGreaterThan(bodyStart);
  return appStyles.slice(bodyStart, bodyEnd);
}

describe("reading settings visual hierarchy", () => {
  it("keeps reading measure and outer padding independent from font size", () => {
    const markdownBody = cssRule(".markdown-body");

    expect(markdownBody).toMatch(
      /width:\s*min\(calc\(100% - 64px\), var\(--reading-content-width\)\)/,
    );
    expect(markdownBody).toMatch(
      /padding:\s*var\(--reading-padding-top\) 0 var\(--reading-padding-bottom\)/,
    );
    expect(markdownBody).not.toMatch(/width:[^;]*em|padding:[^;]*em/);
  });

  it("places a stable tooltip immediately beside the diagram help icon", () => {
    const popover = cssRule(".settings-popover");
    const help = cssRule(".mermaid-curve-help");
    const button = cssRule(".settings-help-button");
    const hitArea = cssRule(".settings-help-button::before");
    const icon = cssRule(".settings-help-button svg");
    const tooltip = cssRule(".settings-help-tooltip");

    expect(popover).not.toMatch(/max-height|overflow-y|overscroll-behavior/);
    expect(help).toMatch(/position:\s*relative/);
    expect(help).toMatch(/display:\s*inline-flex/);
    expect(help).toMatch(/width:\s*max-content/);
    expect(help).toMatch(/height:\s*20px/);
    expect(help).toMatch(/justify-self:\s*start/);
    expect(help).toMatch(/gap:\s*3px/);
    expect(button).toMatch(/position:\s*relative/);
    expect(button).toMatch(/width:\s*20px/);
    expect(button).toMatch(/height:\s*20px/);
    expect(button).toMatch(/border:\s*0/);
    expect(hitArea).toMatch(/position:\s*absolute/);
    expect(hitArea).toMatch(/inset:\s*-2px/);
    expect(hitArea).toMatch(/content:\s*""/);
    expect(icon).toMatch(/width:\s*14px/);
    expect(icon).toMatch(/height:\s*14px/);
    expect(tooltip).toMatch(/position:\s*absolute/);
    expect(tooltip).toMatch(/top:\s*calc\(50% - 5px\)/);
    expect(tooltip).toMatch(/left:\s*calc\(100% \+ 6px\)/);
    expect(tooltip).toMatch(/width:\s*160px/);
    expect(tooltip).toMatch(/padding:\s*4px 8px/);
    expect(tooltip).toMatch(/pointer-events:\s*none/);
    expect(tooltip).toMatch(/opacity:\s*0/);
    expect(tooltip).toMatch(/transform:\s*translateY\(-50%\)/);
    expect(tooltip).toMatch(/visibility:\s*hidden/);
    expect(tooltip).not.toMatch(/transition|border-left/);
    expect(appStyles).toMatch(
      /\.settings-help-button\[data-tooltip-visible="true"\]\s*\+ \.settings-help-tooltip/,
    );
    expect(appStyles).not.toMatch(/\.mermaid-curve-help:hover/);
  });
});
