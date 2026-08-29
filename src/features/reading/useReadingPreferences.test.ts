import { listen } from "@tauri-apps/api/event";
import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { readingPreferenceStorageKeys } from "./reading-preferences";
import { useReadingPreferences } from "./useReadingPreferences";

vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn(),
}));

describe("reading preference controller", () => {
  beforeEach(() => {
    vi.mocked(listen).mockReset();
    vi.mocked(listen).mockResolvedValue(() => undefined);
    localStorage.clear();
  });

  it("loads and saves the existing v1 primitive values", () => {
    localStorage.setItem(readingPreferenceStorageKeys.theme, "night");
    localStorage.setItem(readingPreferenceStorageKeys.font, "noto-serif");
    localStorage.setItem(readingPreferenceStorageKeys.lineSpacing, "relaxed");
    localStorage.setItem(readingPreferenceStorageKeys.scrollSync, "on");
    const { result } = renderHook(() => useReadingPreferences());

    expect(result.current).toMatchObject({
      theme: "night",
      readingFont: "noto-serif",
      lineSpacing: "relaxed",
      isScrollSyncEnabled: true,
    });

    act(() => {
      result.current.selectTheme("paper");
      result.current.selectReadingFont("system");
      result.current.selectLineSpacing("compact");
      result.current.toggleScrollSync();
    });

    expect(localStorage.getItem(readingPreferenceStorageKeys.theme)).toBe(
      "paper",
    );
    expect(localStorage.getItem(readingPreferenceStorageKeys.font)).toBe(
      "system",
    );
    expect(
      localStorage.getItem(readingPreferenceStorageKeys.lineSpacing),
    ).toBe("compact");
    expect(
      localStorage.getItem(readingPreferenceStorageKeys.scrollSync),
    ).toBe("off");
  });

  it("normalizes native zoom commands and cleans up the listener", async () => {
    const unlisten = vi.fn();
    vi.mocked(listen).mockResolvedValue(unlisten);
    const { result, unmount } = renderHook(() => useReadingPreferences());
    await waitFor(() =>
      expect(listen).toHaveBeenCalledWith(
        "reading-zoom-requested",
        expect.any(Function),
      ),
    );
    const handler = vi.mocked(listen).mock.calls[0][1] as (event: {
      payload: "in" | "out" | "reset";
    }) => void;

    act(() => handler({ payload: "in" }));
    expect(result.current.readingZoom).toBe("110");
    expect(localStorage.getItem(readingPreferenceStorageKeys.zoom)).toBe(
      "110",
    );
    act(() => handler({ payload: "reset" }));
    expect(result.current.readingZoom).toBe("100");

    unmount();
    await waitFor(() => expect(unlisten).toHaveBeenCalledOnce());
  });

  it("keeps session state when preference storage fails", () => {
    const storageWrite = vi
      .spyOn(Storage.prototype, "setItem")
      .mockImplementation(() => {
        throw new Error("storage unavailable");
      });
    const { result } = renderHook(() => useReadingPreferences());

    act(() => result.current.selectTheme("dracula"));

    expect(result.current.theme).toBe("dracula");
    storageWrite.mockRestore();
  });
});
