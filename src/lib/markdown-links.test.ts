import { describe, expect, it } from "vitest";
import {
  classifyMarkdownLink,
  decodeRelativeAssetPath,
  isRelativeAssetSource,
} from "./markdown-links";

describe("Markdown link classification", () => {
  it.each([
    ["#JWT%20정책", { kind: "anchor", anchor: "JWT 정책" }],
    ["./guide.md", { kind: "markdown", path: "./guide.md", anchor: null }],
    [
      "../%ED%95%9C%EA%B8%80.markdown?view=reader#%EC%86%8C%EA%B0%9C",
      { kind: "markdown", path: "../한글.markdown", anchor: "소개" },
    ],
    ["https://example.com/docs?q=1#start", { kind: "external", url: "https://example.com/docs?q=1#start" }],
    ["//example.com/guide", { kind: "external", url: "https://example.com/guide" }],
  ])("classifies %s", (href, expected) => {
    expect(classifyMarkdownLink(href)).toEqual(expected);
  });

  it.each(["file:///tmp/guide.md", "javascript:alert(1)", "/tmp/guide.md", "C:/guide.md", "./notes.txt", "%ZZ.md"])(
    "rejects unsupported target %s",
    (href) => expect(classifyMarkdownLink(href).kind).toBe("unsupported"),
  );

  it("decodes only relative asset paths", () => {
    expect(isRelativeAssetSource("../assets/cover.png?raw=1")).toBe(true);
    expect(decodeRelativeAssetPath("../assets/%ED%91%9C%EC%A7%80.png?raw=1#image")).toBe(
      "../assets/표지.png",
    );
    expect(isRelativeAssetSource("https://example.com/cover.png")).toBe(false);
    expect(decodeRelativeAssetPath("data:image/png;base64,AA==")).toBeNull();
  });
});
