import { afterEach, describe, expect, it, vi } from "vitest";
import { captureReadingTextAnchor, getReadingTextAnchorTop } from "./reading-text-anchor";

afterEach(() => vi.restoreAllMocks());

describe("reading text position", () => {
  it("follows the same character across reflow and inline node replacement", () => {
    const paragraph = document.createElement("p");
    paragraph.innerHTML = "한글문장<strong>강조문장</strong>계속읽는문장";
    let width = 5;
    let top = 20;
    const rangeRect = function(this: Range) {
      const walker = document.createTreeWalker(paragraph, NodeFilter.SHOW_TEXT);
      let offset = this.startOffset;
      while (walker.nextNode() && walker.currentNode !== this.startContainer) offset += walker.currentNode.textContent!.length;
      const y = top + Math.floor(offset / width) * 20;
      return { top: y, bottom: y + 20, height: 20 } as DOMRect;
    };
    Object.defineProperty(Range.prototype, "getBoundingClientRect", {configurable: true, value: rangeRect});
    const snapshot = captureReadingTextAnchor(paragraph, 0, 42)!;
    expect(snapshot.offset).toBe(5);
    expect(snapshot.viewportTop).toBe(40);
    width = 3; top = 120;
    paragraph.innerHTML = "<em>한글문장강조문장</em>계속읽는문장";
    expect(getReadingTextAnchorTop(paragraph, snapshot)).toBe(140);
    delete (Range.prototype as Partial<Range>).getBoundingClientRect;
  });
  it("falls back for unmeasurable text without changing the document selection", () => {
    const paragraph = document.createElement("p"); paragraph.textContent = "문장";
    expect(captureReadingTextAnchor(paragraph, 0, 120)).toBeNull();
    expect(document.getSelection()?.rangeCount).toBe(0);
  });
});
