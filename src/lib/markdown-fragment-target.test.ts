import { describe, expect, it } from "vitest";
import { findMarkdownFragmentTarget } from "./markdown-fragment-target";

describe("Markdown fragment targets", () => {
  it("prefers an exact explicit id before the normalized heading fallback", () => {
    const container = document.createElement("div");
    container.innerHTML = `
      <h2 data-markdown-anchor="english-version">Heading</h2>
      <a data-markdown-html-id="English-Version"></a>
      <a data-markdown-html-id="english-version"></a>
    `;

    expect(findMarkdownFragmentTarget(container, "English-Version")).toBe(
      container.children[1],
    );
    expect(findMarkdownFragmentTarget(container, "ENGLISH-VERSION")).toBe(
      container.children[0],
    );
  });

  it("supports name targets, percent-decoded fragments, and duplicate headings", () => {
    const container = document.createElement("div");
    container.innerHTML = `
      <a data-markdown-html-name="한글 앵커"></a>
      <h2 data-markdown-anchor="소개">First</h2>
      <h2 data-markdown-anchor="소개-1">Second</h2>
    `;

    expect(findMarkdownFragmentTarget(container, "한글 앵커")).toBe(
      container.children[0],
    );
    expect(findMarkdownFragmentTarget(container, "소개-1")).toBe(
      container.children[2],
    );
    expect(findMarkdownFragmentTarget(container, "missing")).toBeNull();
  });
});
