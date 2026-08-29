import { describe, expect, it } from "vitest";
import { getPreviewScrollRegions } from "./preview-scroll-regions";

describe("preview scroll regions", () => {
  it("includes Mermaid wrappers without double-counting their error source", () => {
    const preview = document.createElement("div");
    preview.innerHTML = `
      <article class="markdown-body">
        <pre></pre>
        <div class="table-scroll"></div>
        <div class="mermaid-diagram-scroll">
          <pre class="mermaid-diagram-source"></pre>
        </div>
      </article>
    `;

    expect(
      getPreviewScrollRegions(preview).map((element) => element.className),
    ).toEqual(["", "table-scroll", "mermaid-diagram-scroll"]);
  });
});
