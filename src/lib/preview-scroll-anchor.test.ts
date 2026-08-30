import { describe, expect, it } from "vitest";
import {
  capturePreviewScrollAnchor,
  restorePreviewScrollAnchor,
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
});
