import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { MermaidThemeTokens } from "./mermaid-renderer";

const originalCSSStyleSheet = globalThis.CSSStyleSheet;
const svgElementPrototype = SVGElement.prototype as unknown as {
  getBBox?: () => DOMRect;
  getComputedTextLength?: () => number;
};
const originalGetBBox = svgElementPrototype.getBBox;
const originalGetComputedTextLength = svgElementPrototype.getComputedTextLength;

class TestCSSStyleSheet {
  cssRules: Array<{ cssText: string }> = [];

  insertRule(rule: string) {
    this.cssRules.push({ cssText: rule });
    return this.cssRules.length - 1;
  }

  replaceSync(css: string) {
    this.cssRules = [{ cssText: css }];
  }
}

const theme: MermaidThemeTokens = {
  background: "#ffffff",
  surface: "#f8f8f8",
  surfaceMuted: "#eeeeee",
  text: "#222222",
  textStrong: "#111111",
  border: "#cccccc",
  accent: "#336699",
  accentSoft: "#99bbcc",
  fontFamily: "sans-serif",
  fontSize: "17px",
  darkMode: false,
};

describe("Mermaid renderer security boundary", () => {
  beforeAll(() => {
    Object.defineProperty(globalThis, "CSSStyleSheet", {
      configurable: true,
      value: TestCSSStyleSheet,
    });
    Object.defineProperty(svgElementPrototype, "getBBox", {
      configurable: true,
      value: () => ({ x: 0, y: 0, width: 160, height: 24 }),
    });
    Object.defineProperty(svgElementPrototype, "getComputedTextLength", {
      configurable: true,
      value: () => 160,
    });
  });

  afterAll(() => {
    Object.defineProperty(globalThis, "CSSStyleSheet", {
      configurable: true,
      value: originalCSSStyleSheet,
    });
    if (originalGetBBox) {
      Object.defineProperty(svgElementPrototype, "getBBox", {
        configurable: true,
        value: originalGetBBox,
      });
    } else {
      delete svgElementPrototype.getBBox;
    }
    if (originalGetComputedTextLength) {
      Object.defineProperty(svgElementPrototype, "getComputedTextLength", {
        configurable: true,
        value: originalGetComputedTextLength,
      });
    } else {
      delete svgElementPrototype.getComputedTextLength;
    }
  });

  it("rejects frontmatter attempts to enable HTML labels or loose security", async () => {
    const { renderMermaidDiagram } = await import("./mermaid-renderer");
    const source = `---
config:
  securityLevel: loose
  htmlLabels: true
  themeCSS: "rect { fill: red; }"
---
flowchart LR
A["<b>unsafe</b>"] --> B[완료]
click A "https://example.com"`;

    const svg = await renderMermaidDiagram({
      source,
      theme,
      signal: new AbortController().signal,
    });

    expect(svg).not.toMatch(/<foreignObject/iu);
    expect(svg).not.toMatch(/<b[ >]/iu);
    expect(svg).toContain("&lt;b&gt;");
    expect(svg).toContain("&lt;/b&gt;");
    expect(svg).not.toMatch(/fill:\s*red/iu);
    expect(svg).not.toMatch(/<a[ >]/iu);
    expect(svg).not.toMatch(/onclick=/iu);
    const document = new DOMParser().parseFromString(svg, "image/svg+xml");
    expect(document.querySelector(".clickable")).toBeNull();
    const linkedNode = document.querySelector("[id*='flowchart-A']");
    expect(linkedNode?.closest("g[transform]")).not.toBeNull();
  });
});
