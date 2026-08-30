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
      curve: "curved",
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

  it("keeps the allowlisted curve when frontmatter requests another value", async () => {
    const { renderMermaidDiagram } = await import("./mermaid-renderer");
    const source = `---
config:
  flowchart:
    curve: basis
---
flowchart LR
A --> B`;

    const svg = await renderMermaidDiagram({
      source,
      theme: { ...theme, accent: "#246802" },
      curve: "orthogonal",
      signal: new AbortController().signal,
    });
    const document = new DOMParser().parseFromString(svg, "image/svg+xml");
    const edgePath = document.querySelector<SVGPathElement>(".flowchart-link");

    expect(edgePath).not.toBeNull();
    expect(edgePath?.getAttribute("d")).not.toMatch(/[CSQ]/u);
  });

  it("keeps the allowlisted curve when an init directive requests another value", async () => {
    const { renderMermaidDiagram } = await import("./mermaid-renderer");
    const svg = await renderMermaidDiagram({
      source: `%%{init: {"flowchart": {"curve": "basis"}}}%%
flowchart LR
A --> B`,
      theme: { ...theme, accent: "#246801" },
      curve: "orthogonal",
      signal: new AbortController().signal,
    });
    const document = new DOMParser().parseFromString(svg, "image/svg+xml");
    const edgePath = document.querySelector<SVGPathElement>(".flowchart-link");

    expect(edgePath).not.toBeNull();
    expect(edgePath?.getAttribute("d")).not.toMatch(/[CSQ]/u);
  });

  it("keeps an edge-level author curve above the application default", async () => {
    const { renderMermaidDiagram } = await import("./mermaid-renderer");
    const svg = await renderMermaidDiagram({
      source: `flowchart LR
A e1@--> B
C --> D
e1@{ curve: linear }`,
      theme: { ...theme, accent: "#246803" },
      curve: "curved",
      signal: new AbortController().signal,
    });
    const document = new DOMParser().parseFromString(svg, "image/svg+xml");
    const authoredEdge = document.querySelector<SVGPathElement>(
      '[data-edge="true"][data-id="e1"]',
    );
    const defaultEdge = Array.from(
      document.querySelectorAll<SVGPathElement>('[data-edge="true"]'),
    ).find((edge) => edge !== authoredEdge);

    expect(authoredEdge).not.toBeNull();
    expect(authoredEdge?.getAttribute("d")).not.toMatch(/[CSQ]/u);
    expect(defaultEdge).not.toBeUndefined();
    expect(defaultEdge?.getAttribute("d")).toMatch(/C/u);
  });

  it.each(["LR", "TB", "RL", "BT"] as const)(
    "keeps the %s flowchart direction with orthogonal connectors",
    async (direction) => {
      const { renderMermaidDiagram } = await import("./mermaid-renderer");
      const svg = await renderMermaidDiagram({
        source: `flowchart ${direction}\nA --> B`,
        theme: { ...theme, accent: `#24680${direction.length}` },
        curve: "orthogonal",
        signal: new AbortController().signal,
      });
      const document = new DOMParser().parseFromString(svg, "image/svg+xml");
      const edgePath = document.querySelector<SVGPathElement>(".flowchart-link");
      const readPosition = (nodeId: string) => {
        const node = document.querySelector<SVGGElement>(
          `[id*="flowchart-${nodeId}"]`,
        );
        const transform = node?.getAttribute("transform") ?? "";
        const match = transform.match(/translate\(([-\d.]+),\s*([-\d.]+)\)/u);
        return match ? { x: Number(match[1]), y: Number(match[2]) } : null;
      };
      const first = readPosition("A");
      const second = readPosition("B");

      expect(edgePath?.getAttribute("d")).not.toMatch(/[CSQ]/u);
      expect(first).not.toBeNull();
      expect(second).not.toBeNull();
      if (!first || !second) return;
      if (direction === "LR") expect(first.x).toBeLessThan(second.x);
      if (direction === "RL") expect(first.x).toBeGreaterThan(second.x);
      if (direction === "TB") expect(first.y).toBeLessThan(second.y);
      if (direction === "BT") expect(first.y).toBeGreaterThan(second.y);
    },
  );

  it("applies the flowchart curve preference to swimlanes", async () => {
    const { renderMermaidDiagram } = await import("./mermaid-renderer");
    const source = `swimlane-beta LR
subgraph Writer
  draft[Draft]
end
subgraph Reviewer
  review[Review]
end
draft --> review`;
    const curvedSvg = await renderMermaidDiagram({
      source,
      theme: { ...theme, accent: "#246806" },
      curve: "curved",
      signal: new AbortController().signal,
    });
    const orthogonalSvg = await renderMermaidDiagram({
      source,
      theme: { ...theme, accent: "#246806" },
      curve: "orthogonal",
      signal: new AbortController().signal,
    });
    const curvedEdge = new DOMParser()
      .parseFromString(curvedSvg, "image/svg+xml")
      .querySelector<SVGPathElement>(".flowchart-link");
    const orthogonalEdge = new DOMParser()
      .parseFromString(orthogonalSvg, "image/svg+xml")
      .querySelector<SVGPathElement>(".flowchart-link");

    expect(curvedEdge?.getAttribute("d")).toMatch(/C/u);
    expect(orthogonalEdge?.getAttribute("d")).not.toMatch(/[CSQ]/u);
  });

  it.each([
    {
      name: "sequence",
      selector: ".messageLine0, .messageLine1",
      source: "sequenceDiagram\nAlice->>Bob: Save",
    },
    {
      name: "entity relationship",
      selector: ".relationshipLine",
      source: "erDiagram\nUSER ||--o{ NOTE : owns",
    },
  ])("does not alter $name connectors", async ({ selector, source }) => {
    const { renderMermaidDiagram } = await import("./mermaid-renderer");
    const render = async (curve: "curved" | "orthogonal") => {
      const svg = await renderMermaidDiagram({
        source,
        theme: { ...theme, accent: "#246807" },
        curve,
        signal: new AbortController().signal,
      });
      const document = new DOMParser().parseFromString(svg, "image/svg+xml");
      return Array.from(document.querySelectorAll<SVGElement>(selector)).map(
        (element) =>
          element.getAttribute("d") ??
          ["x1", "y1", "x2", "y2"]
            .map((attribute) => element.getAttribute(attribute))
            .join(","),
      );
    };

    const curvedConnectors = await render("curved");
    const orthogonalConnectors = await render("orthogonal");
    expect(curvedConnectors.length).toBeGreaterThan(0);
    expect(orthogonalConnectors).toEqual(curvedConnectors);
  });
});
