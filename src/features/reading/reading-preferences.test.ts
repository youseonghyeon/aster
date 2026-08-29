import { describe, expect, it, vi } from "vitest";
import {
  getSteppedReadingZoom,
  loadReadingPreference,
  readingPreferenceStorageKeys,
  themes,
} from "./reading-preferences";

describe("reading preference policies", () => {
  it("loads only known values and falls back for invalid storage", () => {
    localStorage.setItem(readingPreferenceStorageKeys.theme, "night");
    expect(
      loadReadingPreference(
        readingPreferenceStorageKeys.theme,
        themes,
        "paper",
      ),
    ).toBe("night");

    localStorage.setItem(readingPreferenceStorageKeys.theme, "unknown");
    expect(
      loadReadingPreference(
        readingPreferenceStorageKeys.theme,
        themes,
        "paper",
      ),
    ).toBe("paper");
  });

  it("falls back when storage cannot be read", () => {
    const storageRead = vi
      .spyOn(Storage.prototype, "getItem")
      .mockImplementation(() => {
        throw new Error("storage unavailable");
      });

    expect(
      loadReadingPreference(
        readingPreferenceStorageKeys.theme,
        themes,
        "paper",
      ),
    ).toBe("paper");
    storageRead.mockRestore();
  });

  it("clamps zoom steps at both boundaries", () => {
    expect(getSteppedReadingZoom("80", -1)).toBe("80");
    expect(getSteppedReadingZoom("100", 1)).toBe("110");
    expect(getSteppedReadingZoom("150", 1)).toBe("150");
  });
});
