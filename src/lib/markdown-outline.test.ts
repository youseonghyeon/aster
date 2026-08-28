import { describe, expect, it } from "vitest";
import { getMarkdownHeadingId, getMarkdownOutline } from "./markdown-outline";

describe("markdown outline", () => {
  it("uses source offsets for stable ids and preserves heading depth", () => {
    expect(getMarkdownOutline("# 제목\n\n### 하위 **제목**\n")).toEqual([
      { id: "aster-heading-0", depth: 1, title: "제목" },
      { id: "aster-heading-6", depth: 3, title: "하위 제목" },
    ]);
  });

  it("does not create ids without an offset", () => {
    expect(getMarkdownHeadingId(undefined)).toBeUndefined();
  });
});
