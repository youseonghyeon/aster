import { expect, it } from "vitest";
import { captureReadingScrollRegions, remapReadingScrollRegions, restoreReadingScrollRegions } from "./reading-scroll-regions";
import { createReadingOffsetMapper } from "./reading-anchor-mapping";

it("restores a table by mapped identity after another region is inserted before it", () => {
  const preview = document.createElement("div");
  preview.innerHTML = '<article class="markdown-body"><div class="table-scroll" data-source-offset="5"></div></article>';
  const table = preview.querySelector<HTMLElement>(".table-scroll")!;
  table.scrollLeft = 75; table.scrollTop = 15;
  const snapshot = captureReadingScrollRegions(preview);
  const mapped = remapReadingScrollRegions(snapshot, createReadingOffsetMapper("head\ntable", "new\nhead\ntable"));
  preview.innerHTML = '<article class="markdown-body"><pre data-source-offset="0"></pre><div class="table-scroll" data-source-offset="9"></div></article>';
  restoreReadingScrollRegions(preview, mapped);
  expect(preview.querySelector<HTMLElement>("pre")!.scrollLeft).toBe(0);
  expect(preview.querySelector<HTMLElement>(".table-scroll")!.scrollLeft).toBe(75);
  expect(preview.querySelector<HTMLElement>(".table-scroll")!.scrollTop).toBe(15);
});
