import { describe, expect, it } from "vitest";
import {
  createMarkdownHeadingAnchor,
  rehypeMarkdownHeadingAnchors,
} from "./markdown-heading-anchors";

describe("Markdown heading anchors", () => {
  it("normalizes Korean, spacing, formatting punctuation, and symbols", () => {
    expect(createMarkdownHeadingAnchor("  JWT 정책: 시작하기!  ")).toBe(
      "jwt-정책-시작하기",
    );
  });

  it("adds stable suffixes to duplicate headings", () => {
    const tree = {
      type: "root",
      children: [
        { type: "element", tagName: "h2", properties: {}, children: [{ type: "text", value: "소개" }] },
        { type: "element", tagName: "h3", properties: {}, children: [{ type: "text", value: "소개" }] },
      ],
    };
    rehypeMarkdownHeadingAnchors()(tree);

    expect(tree.children[0]?.properties).toMatchObject({
      "data-markdown-anchor": "소개",
    });
    expect(tree.children[1]?.properties).toMatchObject({
      "data-markdown-anchor": "소개-1",
    });
  });
});
