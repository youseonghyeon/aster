import { describe, expect, it } from "vitest";
import { createReadingOffsetMapper } from "./reading-anchor-mapping";

describe("reading offset mapping", () => {
  it("moves an unchanged paragraph after insertion and deletion above it", () => {
    const original = "# 제목\n\n읽고 있는 한글 문단\n\n끝";
    const offset = original.indexOf("읽고");
    expect(createReadingOffsetMapper(original, "추가\n" + original)(offset)).toBe(offset + 3);
    expect(createReadingOffsetMapper(original, original.slice(6))(offset)).toBe(offset - 6);
  });
  it("keeps the original occurrence when a repeated paragraph is appended", () => {
    const original = "머리\n\n동일한 문단입니다\n\n끝";
    const offset = original.indexOf("동일한");
    expect(createReadingOffsetMapper(original, original + "\n\n동일한 문단입니다")(offset)).toBe(offset);
  });
  it("uses both neighbours to distinguish repetition inside multiple edits", () => {
    const original = "old heading\nalpha\nRepeated paragraph\nbeta\nRepeated paragraph\ngamma\nold ending";
    const next = original.replace("old heading", "much longer heading").replace("old ending", "new ending");
    const offset = original.lastIndexOf("Repeated");
    expect(createReadingOffsetMapper(original, next)(offset)).toBe(next.lastIndexOf("Repeated"));
  });
  it("does not claim deleted text or an ambiguous repeated context survives", () => {
    expect(createReadingOffsetMapper("before\nremoved paragraph\nafter", "before\nafter")(7)).toBeNull();
    const block = "x".repeat(200) + "reading paragraph" + "y".repeat(200);
    const old = "old" + block + "end";
    const next = "new" + block + block + "tail";
    expect(createReadingOffsetMapper(old, next)(203)).toBeNull();
  });
  it("maps a 10MB document without an edit-distance matrix", () => {
    const original = "a".repeat(5_000_000) + "\nreading paragraph\n" + "b".repeat(4_999_900);
    expect(createReadingOffsetMapper(original, "prefix\n" + original)(5_000_001)).toBe(5_000_008);
  });
});
