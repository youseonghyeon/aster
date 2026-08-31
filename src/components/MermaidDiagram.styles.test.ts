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

describe("Mermaid large-view spacing", () => {
  it("keeps responsive pan space around every diagram edge", () => {
    const canvas = cssRule(
      ".markdown-body .mermaid-diagram-dialog-canvas",
    );

    expect(canvas).toMatch(/width:\s*max-content/);
    expect(canvas).toMatch(/min-width:\s*100%/);
    expect(canvas).toMatch(/min-height:\s*100%/);
    expect(canvas).toMatch(/padding:\s*clamp\(40px, 6vw, 72px\)/);
    expect(canvas).toMatch(/place-items:\s*center/);
  });
});
