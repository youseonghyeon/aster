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
    expect(canvas).toMatch(/padding:\s*clamp\(20px, 3vw, 36px\)/);
    expect(canvas).toMatch(/place-items:\s*center/);
  });
});


it("draws no focus outline inside the preview, including zoom buttons", () => {
  for (const selector of [
    ".markdown-body :focus",
    ".markdown-body .mermaid-diagram-scroll:focus",
    ".markdown-body .mermaid-diagram-canvas.is-openable:focus",
    ".markdown-body .mermaid-diagram-dialog-close:focus",
  ]) expect(cssRule(selector)).toMatch(/outline:\s*none/);
  expect(appStyles).not.toContain(".markdown-body .mermaid-diagram-control-button:focus-visible {");
});


it("restores the original content-driven height limit", () => {
  const viewport = cssRule(".markdown-body .mermaid-diagram-scroll");
  expect(viewport).not.toMatch(/min-height:/);
  expect(viewport).toMatch(/max-height:\s*min\(70vh, 760px\)/);
});
