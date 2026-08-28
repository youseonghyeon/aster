import { describe, expect, it } from "vitest";
import { findTextMatches, normalizeSearchIndex } from "./text-search";

const plainSearch = { isCaseSensitive: false, isRegex: false };

describe("findTextMatches", () => {
  it("finds literal text without treating regexp characters specially", () => {
    expect(findTextMatches("a.b A.B", "a.b", plainSearch).matches).toEqual([
      { start: 0, end: 3 },
      { start: 4, end: 7 },
    ]);
  });

  it("supports case-sensitive and regexp searches", () => {
    expect(
      findTextMatches("Aster aster", "Aster", {
        isCaseSensitive: true,
        isRegex: false,
      }).matches,
    ).toEqual([{ start: 0, end: 5 }]);
    expect(
      findTextMatches("a1 a22", "a\\d+", {
        isCaseSensitive: false,
        isRegex: true,
      }).matches,
    ).toHaveLength(2);
  });

  it("reports invalid regular expressions", () => {
    expect(
      findTextMatches("text", "[", {
        isCaseSensitive: false,
        isRegex: true,
      }).error,
    ).toContain("정규식");
  });

  it("advances zero-length unicode matches without looping", () => {
    const result = findTextMatches("😀😀", "(?=😀)", {
      isCaseSensitive: false,
      isRegex: true,
    });

    expect(result.matches).toEqual([
      { start: 0, end: 0 },
      { start: 2, end: 2 },
    ]);
  });

  it("caps stored matches and reports truncation", () => {
    const result = findTextMatches("a".repeat(10_001), "a", plainSearch);

    expect(result.matches).toHaveLength(10_000);
    expect(result.isTruncated).toBe(true);
  });
});

describe("normalizeSearchIndex", () => {
  it("wraps indexes in both directions", () => {
    expect(normalizeSearchIndex(3, 3)).toBe(0);
    expect(normalizeSearchIndex(-1, 3)).toBe(2);
    expect(normalizeSearchIndex(4, 0)).toBe(0);
  });
});
