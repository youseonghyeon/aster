import { describe, expect, it } from "vitest";
import {
  capturePreviewScrollAnchor,
  capturePreviewReadingAnchor,
  restorePreviewReadingAnchor,
  restorePreviewScrollAnchor,
  remapPreviewReadingAnchor,
} from "./preview-scroll-anchor";

describe("preview scroll anchors", () => {
  it("restores a stable source anchor after content above it changes size", () => {
    const preview = document.createElement("div");
    preview.className = "preview-scroll";
    const diagram = document.createElement("div");
    const anchor = document.createElement("p");
    anchor.dataset.sourceOffset = "42";
    preview.append(diagram, anchor);
    document.body.append(preview);
    preview.scrollTop = 100;
    let anchorLayoutTop = 80;
    preview.getBoundingClientRect = () =>
      ({ top: 0 } as DOMRect);
    anchor.getBoundingClientRect = () =>
      ({ top: anchorLayoutTop - preview.scrollTop } as DOMRect);

    const snapshot = capturePreviewScrollAnchor(diagram);
    expect(snapshot?.topDelta).toBe(-20);
    anchorLayoutTop = 140;
    if (snapshot) restorePreviewScrollAnchor(snapshot);

    expect(preview.scrollTop).toBe(160);
    expect(anchor.getBoundingClientRect().top).toBe(-20);
    preview.remove();
  });

  it("falls back to the previous scroll offset when its anchor disappears", () => {
    const preview = document.createElement("div");
    preview.className = "preview-scroll";
    const descendant = document.createElement("div");
    preview.append(descendant);
    document.body.append(preview);
    preview.scrollTop = 75;
    const snapshot = capturePreviewScrollAnchor(descendant);
    preview.scrollTop = 0;
    if (snapshot) restorePreviewScrollAnchor(snapshot);

    expect(preview.scrollTop).toBe(75);
    preview.remove();
  });

  it("chooses the closest anchor on either side of the viewport top", () => {
    const preview = document.createElement("div");
    preview.className = "preview-scroll";
    const descendant = document.createElement("div");
    const farAbove = document.createElement("div");
    farAbove.dataset.sourceOffset = "10";
    const nearBelow = document.createElement("p");
    nearBelow.dataset.sourceOffset = "20";
    preview.append(descendant, farAbove, nearBelow);
    document.body.append(preview);
    preview.getBoundingClientRect = () => ({ top: 0 } as DOMRect);
    farAbove.getBoundingClientRect = () => ({ top: -500 } as DOMRect);
    nearBelow.getBoundingClientRect = () => ({ top: 5 } as DOMRect);

    expect(capturePreviewScrollAnchor(descendant)?.sourceOffset).toBe("20");
    preview.remove();
  });

  it("keeps the reading focus point inside a resized block", () => {
    const preview = document.createElement("div");
    preview.className = "preview-scroll";
    const paragraph = document.createElement("p");
    paragraph.dataset.sourceOffset = "42";
    preview.append(paragraph);
    document.body.append(preview);
    Object.defineProperties(preview, {
      clientHeight: { configurable: true, value: 600 },
      scrollHeight: { configurable: true, value: 1200 },
    });
    preview.scrollTop = 200;
    preview.getBoundingClientRect = () => ({ top: 0 } as DOMRect);
    let paragraphLayoutTop = 260;
    let paragraphHeight = 240;
    paragraph.getBoundingClientRect = () =>
      ({
        top: paragraphLayoutTop - preview.scrollTop,
        bottom: paragraphLayoutTop - preview.scrollTop + paragraphHeight,
        height: paragraphHeight,
      }) as DOMRect;

    const snapshot = capturePreviewReadingAnchor(preview);
    expect(snapshot).toMatchObject({
      sourceOffset: "42",
      blockProgress: 0.25,
      viewportOffset: 120,
    });

    paragraphLayoutTop = 320;
    paragraphHeight = 300;
    restorePreviewReadingAnchor(snapshot);

    expect(preview.scrollTop).toBe(275);
    const paragraphRect = paragraph.getBoundingClientRect();
    expect(paragraphRect.top + paragraphRect.height * 0.25).toBe(120);
    preview.remove();
  });

  it("falls back to normalized progress when the reading block disappears", () => {
    const preview = document.createElement("div");
    preview.className = "preview-scroll";
    document.body.append(preview);
    Object.defineProperties(preview, {
      clientHeight: { configurable: true, value: 500 },
      scrollHeight: { configurable: true, value: 1500 },
    });
    preview.scrollTop = 400;

    const snapshot = capturePreviewReadingAnchor(preview);
    Object.defineProperty(preview, "scrollHeight", {
      configurable: true,
      value: 2500,
    });
    restorePreviewReadingAnchor(snapshot);

    expect(preview.scrollTop).toBe(800);
    preview.remove();
  });
});

it("does not scroll when the closest block is outside the reading focus line", () => {
  const preview = document.createElement("div");
  const paragraph = document.createElement("p"); paragraph.dataset.sourceOffset = "0";
  preview.append(paragraph); document.body.append(preview);
  Object.defineProperties(preview, {clientHeight: {value:600},scrollHeight:{value:3000}});
  preview.scrollTop = 50;
  preview.getBoundingClientRect = () => ({top:0} as DOMRect);
  paragraph.getBoundingClientRect = () => ({top:1120-preview.scrollTop,bottom:1220-preview.scrollTop,height:100} as DOMRect);
  const snapshot = capturePreviewReadingAnchor(preview);
  restorePreviewReadingAnchor(snapshot);
  expect(preview.scrollTop).toBe(50);
  preview.remove();
});


it("uses the nearest surviving source neighbour when the reading block is deleted", () => {
  const snapshot = {
    container:document.createElement("div"),sourceOffset:"100",blockProgress:0.5,
    viewportOffset:120,scrollProgress:0.4,scrollTop:400,neighbours:["120","20"],
  };
  const mapped = remapPreviewReadingAnchor(snapshot, offset => offset === 100 ? null : offset - 10);
  expect(mapped.sourceOffset).toBe("110");
  expect(mapped.blockProgress).toBe(0);
  expect(mapped.textAnchor).toBeNull();
});

it("ignores source anchors inside collapsed content", () => {
  const preview = document.createElement("div");
  const hidden = document.createElement("p"); hidden.dataset.sourceOffset = "1";
  const visible = document.createElement("p"); visible.dataset.sourceOffset = "20";
  preview.append(hidden,visible);
  Object.defineProperty(preview,"clientHeight",{value:600});
  hidden.getBoundingClientRect = () => ({top:0,bottom:0,height:0} as DOMRect);
  visible.getBoundingClientRect = () => ({top:300,bottom:400,height:100} as DOMRect);
  expect(capturePreviewReadingAnchor(preview).sourceOffset).toBe("20");
});
