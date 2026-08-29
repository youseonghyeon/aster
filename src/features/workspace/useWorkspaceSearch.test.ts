import { describe, expect, it } from "vitest";
import {
  captureSearchSnapshot,
  restoreTextareaSnapshot,
} from "./useWorkspaceSearch";

describe("workspace search snapshots", () => {
  it("captures and restores textarea selection and both scroll axes", () => {
    const textarea = document.createElement("textarea");
    textarea.className = "pane";
    textarea.value = "0123456789";
    document.body.append(textarea);
    textarea.focus();
    textarea.setSelectionRange(2, 7, "forward");
    textarea.scrollTop = 31;
    textarea.scrollLeft = 17;

    const snapshot = captureSearchSnapshot("editor", textarea);
    textarea.setSelectionRange(0, 0);
    textarea.scrollTop = 0;
    textarea.scrollLeft = 0;
    restoreTextareaSnapshot(textarea, snapshot);

    expect(textarea.selectionStart).toBe(2);
    expect(textarea.selectionEnd).toBe(7);
    expect(textarea.scrollTop).toBe(31);
    expect(textarea.scrollLeft).toBe(17);
    textarea.remove();
  });

  it("captures nested preview scroll positions", () => {
    const preview = document.createElement("div");
    preview.innerHTML =
      '<div class="markdown-body"><pre></pre><div class="table-scroll"></div><div class="mermaid-diagram-scroll"><pre class="mermaid-diagram-source"></pre></div></div>';
    const nested = preview.querySelectorAll<HTMLElement>(
      "pre:not(.mermaid-diagram-source), .table-scroll, .mermaid-diagram-scroll",
    );
    nested[0].scrollLeft = 9;
    nested[1].scrollTop = 13;
    nested[2].scrollLeft = 27;

    expect(captureSearchSnapshot("preview", preview).nestedScrollPositions).toEqual([
      { scrollTop: 0, scrollLeft: 9 },
      { scrollTop: 13, scrollLeft: 0 },
      { scrollTop: 0, scrollLeft: 27 },
    ]);
  });
});
