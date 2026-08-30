import { beforeEach, describe, expect, it, vi } from "vitest";
import type { MermaidThemeTokens } from "./mermaid-renderer";

const { initialize, render } = vi.hoisted(() => ({
  initialize: vi.fn(),
  render: vi.fn(),
}));

vi.mock("mermaid", () => ({
  default: {
    initialize,
    render,
    mermaidAPI: {
      defaultConfig: {
        securityLevel: "strict",
        startOnLoad: true,
        flowchart: {},
        sequence: {},
      },
    },
  },
}));

const theme: MermaidThemeTokens = {
  background: "#ffffff",
  surface: "#f8f8f8",
  surfaceMuted: "#eeeeee",
  text: "#222222",
  textStrong: "#111111",
  border: "#cccccc",
  accent: "#336699",
  accentSoft: "#99bbcc",
  fontFamily: "Aster Sans",
  fontSize: "17px",
  darkMode: false,
};

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

describe("mermaid renderer", () => {
  beforeEach(() => {
    initialize.mockReset();
    render.mockReset();
  });

  it("locks Mermaid configuration and does not reinitialize an unchanged theme", async () => {
    const { renderMermaidDiagram } = await import("./mermaid-renderer");
    render.mockResolvedValue({ svg: "<svg></svg>" });

    await renderMermaidDiagram({
      source: "flowchart LR\nA --> B",
      theme,
      curve: "curved",
      signal: new AbortController().signal,
    });
    await renderMermaidDiagram({
      source: "sequenceDiagram\nA->>B: hello",
      theme,
      curve: "curved",
      signal: new AbortController().signal,
    });

    expect(initialize).toHaveBeenCalledTimes(1);
    const config = initialize.mock.calls[0][0];
    expect(config).toMatchObject({
      securityLevel: "strict",
      startOnLoad: false,
      suppressErrorRendering: true,
      htmlLabels: false,
      theme: "base",
      fontFamily: "Aster Sans",
    });
    expect(config.secure).toEqual(
      expect.arrayContaining([
        "securityLevel",
        "startOnLoad",
        "flowchart",
        "sequence",
        "themeCSS",
        "themeVariables",
        "dompurifyConfig",
        "htmlLabels",
      ]),
    );
    expect(render.mock.calls[0][0]).not.toBe(render.mock.calls[1][0]);
    expect(render.mock.calls[0][0]).toMatch(/^aster-mermaid-[a-z0-9-]+$/u);
  });

  it("serializes renders and recovers the queue after a rejection", async () => {
    const { renderMermaidDiagram } = await import("./mermaid-renderer");
    const first = deferred<{ svg: string }>();
    render
      .mockReturnValueOnce(first.promise)
      .mockResolvedValueOnce({ svg: "<svg id='second'></svg>" });

    const firstResult = renderMermaidDiagram({
      source: "broken",
      theme: { ...theme, accent: "#123456" },
      curve: "straight",
      signal: new AbortController().signal,
    });
    const secondResult = renderMermaidDiagram({
      source: "flowchart LR\nA --> B",
      theme: { ...theme, accent: "#123456" },
      curve: "straight",
      signal: new AbortController().signal,
    });

    await vi.waitFor(() => expect(render).toHaveBeenCalledTimes(1));
    first.reject(new Error("invalid diagram"));
    await expect(firstResult).rejects.toThrow("invalid diagram");
    await expect(secondResult).resolves.toContain("second");
    expect(render).toHaveBeenCalledTimes(2);
  });

  it("skips a queued request that becomes stale before execution", async () => {
    const { renderMermaidDiagram } = await import("./mermaid-renderer");
    const first = deferred<{ svg: string }>();
    render.mockReturnValueOnce(first.promise);
    const firstRequest = renderMermaidDiagram({
      source: "flowchart LR\nA --> B",
      theme: { ...theme, accent: "#654321" },
      curve: "curved",
      signal: new AbortController().signal,
    });
    const staleController = new AbortController();
    const staleRequest = renderMermaidDiagram({
      source: "flowchart LR\nB --> C",
      theme: { ...theme, accent: "#654321" },
      curve: "curved",
      signal: staleController.signal,
    });
    staleController.abort();

    first.resolve({ svg: "<svg id='first'></svg>" });
    await expect(firstRequest).resolves.toContain("first");
    await expect(staleRequest).rejects.toMatchObject({ name: "AbortError" });
    expect(render).toHaveBeenCalledTimes(1);
  });

  it("fails closed when Mermaid returns malformed SVG", async () => {
    const { renderMermaidDiagram } = await import("./mermaid-renderer");
    render.mockResolvedValueOnce({ svg: "<svg><a href='https://example.com'>" });

    await expect(
      renderMermaidDiagram({
        source: "flowchart LR\nA --> B",
        theme,
        curve: "curved",
        signal: new AbortController().signal,
      }),
    ).rejects.toThrow("Mermaid returned invalid SVG");
  });

  it("reinitializes when only the curve preference changes", async () => {
    const { renderMermaidDiagram } = await import("./mermaid-renderer");
    render.mockResolvedValue({ svg: "<svg></svg>" });
    const uniqueTheme = { ...theme, accent: "#246810" };

    await renderMermaidDiagram({
      source: "flowchart LR\nA --> B",
      theme: uniqueTheme,
      curve: "curved",
      signal: new AbortController().signal,
    });
    await renderMermaidDiagram({
      source: "flowchart LR\nA --> B",
      theme: uniqueTheme,
      curve: "orthogonal",
      signal: new AbortController().signal,
    });
    await renderMermaidDiagram({
      source: "flowchart LR\nA --> B",
      theme: uniqueTheme,
      curve: "orthogonal",
      signal: new AbortController().signal,
    });

    expect(initialize).toHaveBeenCalledTimes(2);
    expect(initialize.mock.calls[0][0].flowchart.curve).toBe("basis");
    expect(initialize.mock.calls[1][0].flowchart.curve).toBe("stepAfter");
  });
});
