import { describe, expect, it } from "vitest";
import { getReadingFocusOffset } from "./reading-viewport";

describe("reading viewport focus line", () => {
  it.each([
    [300, 72],
    [600, 120],
    [900, 180],
    [1200, 180],
  ])("maps a %ipx viewport to a %ipx offset", (height, offset) => {
    expect(getReadingFocusOffset(height)).toBe(offset);
  });
});
