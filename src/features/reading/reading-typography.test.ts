import { describe, expect, it } from "vitest";
import { getReadingTypographyCompensation } from "./reading-typography";

describe("reading typography compensation", () => {
  it("keeps all representative fonts unchanged at the comfortable size", () => {
    for (const font of [
      "pretendard",
      "noto-sans",
      "gowun-batang",
      "noto-serif",
    ] as const) {
      expect(getReadingTypographyCompensation(font, 17)).toEqual({
        fontWeight: 400,
        textStrokeWidth: 0,
      });
    }
  });

  it("uses the bundled medium Pretendard face only at compact sizes", () => {
    expect(getReadingTypographyCompensation("pretendard", 15)).toEqual({
      fontWeight: 500,
      textStrokeWidth: 0,
    });
    expect(getReadingTypographyCompensation("pretendard", 16.5)).toEqual({
      fontWeight: 400,
      textStrokeWidth: 0,
    });
  });

  it("gives the serif profile slightly more density than the sans profile", () => {
    expect(getReadingTypographyCompensation("noto-sans", 15)).toEqual({
      fontWeight: 440,
      textStrokeWidth: 0,
    });
    expect(getReadingTypographyCompensation("noto-serif", 15)).toEqual({
      fontWeight: 450,
      textStrokeWidth: 0,
    });
  });

  it("uses a subtle stroke instead of Gowun Batang's 700 face", () => {
    expect(getReadingTypographyCompensation("gowun-batang", 15)).toEqual({
      fontWeight: 400,
      textStrokeWidth: 0.056,
    });
    expect(getReadingTypographyCompensation("gowun-batang", 12)).toEqual({
      fontWeight: 400,
      textStrokeWidth: 0.14,
    });
  });

  it("caps compensation below the supported reading range", () => {
    expect(getReadingTypographyCompensation("noto-serif", 9)).toEqual(
      getReadingTypographyCompensation("noto-serif", 12),
    );
  });
});
