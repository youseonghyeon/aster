import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { listen } from "@tauri-apps/api/event";
import {
  getMarkdownFileStatus,
  unwatchMarkdownFile,
  watchMarkdownFile,
} from "./markdown-files";
import {
  getExternalFileObservation,
  useExternalFileStatus,
} from "./useExternalFileStatus";

const runtime = vi.hoisted(() => ({ desktop: false }));
let nativeChangeListener:
  | ((event: { payload: { token: number; path: string } }) => void)
  | undefined;

vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn(async (_event, listener) => {
    nativeChangeListener = listener;
    return () => undefined;
  }),
}));

vi.mock("./markdown-files", () => ({
  getMarkdownFileStatus: vi.fn(),
  isDesktopRuntime: vi.fn(() => runtime.desktop),
  watchMarkdownFile: vi.fn(),
  unwatchMarkdownFile: vi.fn(async () => undefined),
}));

function deferred<T>() {
  let resolve: (value: T) => void = () => undefined;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

describe("external file observations", () => {
  beforeEach(() => {
    runtime.desktop = false;
    nativeChangeListener = undefined;
    vi.mocked(listen).mockClear();
    vi.mocked(getMarkdownFileStatus).mockReset();
    vi.mocked(watchMarkdownFile).mockReset();
    vi.mocked(unwatchMarkdownFile).mockClear();
  });

  it("clears a notice when the loaded revision is still current", () => {
    expect(
      getExternalFileObservation(
        { kind: "available", revision: "same" },
        "same",
        1,
      ),
    ).toEqual({ state: null, unavailableObservationCount: 0 });
  });

  it("reports a changed revision immediately", () => {
    expect(
      getExternalFileObservation(
        { kind: "available", revision: "next" },
        "current",
        0,
      ),
    ).toEqual({
      state: {
        kind: "modified",
        revision: "next",
        observationKey: "modified:next",
      },
      unavailableObservationCount: 0,
    });
  });

  it("requires two consecutive unavailable observations", () => {
    const first = getExternalFileObservation(
      { kind: "unavailable", message: "missing" },
      "current",
      0,
    );
    expect(first).toEqual({
      state: undefined,
      unavailableObservationCount: 1,
    });

    expect(
      getExternalFileObservation(
        { kind: "unavailable", message: "missing" },
        "current",
        first.unavailableObservationCount,
      ),
    ).toEqual({
      state: {
        kind: "unavailable",
        message: "missing",
        observationKey: "unavailable:missing",
      },
      unavailableObservationCount: 2,
    });
  });

  it("does not restore a stale observation after an explicit reset", async () => {
    const staleCheck = deferred<{
      kind: "available";
      revision: string;
    }>();
    vi.mocked(getMarkdownFileStatus)
      .mockReturnValueOnce(staleCheck.promise)
      .mockResolvedValue({
        kind: "available",
        revision: "current-revision",
      });
    const onBeforeNotice = vi.fn();
    const { result } = renderHook(() =>
      useExternalFileStatus({
        documentPath: "/docs/current.md",
        loadedRevision: "current-revision",
        onBeforeNotice,
      }),
    );
    await waitFor(() => expect(getMarkdownFileStatus).toHaveBeenCalledOnce());

    act(() => result.current.resetExternalFileStatus());
    staleCheck.resolve({ kind: "available", revision: "stale-revision" });
    await act(async () => {
      await Promise.resolve();
    });

    expect(result.current.visibleExternalFileState).toBeNull();
    expect(onBeforeNotice).not.toHaveBeenCalled();
  });

  it("does not let a stale poll overwrite an explicit unavailable state", async () => {
    const staleCheck = deferred<{
      kind: "available";
      revision: string;
    }>();
    vi.mocked(getMarkdownFileStatus)
      .mockReturnValueOnce(staleCheck.promise)
      .mockResolvedValue({
        kind: "available",
        revision: "current-revision",
      });
    const { result } = renderHook(() =>
      useExternalFileStatus({
        documentPath: "/docs/current.md",
        loadedRevision: "current-revision",
        onBeforeNotice: vi.fn(),
      }),
    );
    await waitFor(() => expect(getMarkdownFileStatus).toHaveBeenCalledOnce());
    const unavailableState = {
      kind: "unavailable" as const,
      message: "읽기 실패",
      observationKey: "unavailable:읽기 실패",
    };

    act(() => result.current.setExternalFileState(unavailableState));
    staleCheck.resolve({ kind: "available", revision: "stale-revision" });
    await act(async () => {
      await Promise.resolve();
    });

    expect(result.current.visibleExternalFileState).toEqual(unavailableState);
  });

  it("accepts native events only from the active path and watch token", async () => {
    runtime.desktop = true;
    vi.mocked(getMarkdownFileStatus).mockResolvedValue({
      kind: "available",
      revision: "current-revision",
    });
    vi.mocked(watchMarkdownFile).mockResolvedValue({
      token: 17,
      path: "/docs/current.md",
    });
    const { unmount } = renderHook(() =>
      useExternalFileStatus({
        documentPath: "/docs/current.md",
        loadedRevision: "current-revision",
        onBeforeNotice: vi.fn(),
      }),
    );
    await waitFor(() => expect(watchMarkdownFile).toHaveBeenCalledOnce());
    await waitFor(() => expect(getMarkdownFileStatus).toHaveBeenCalledOnce());

    act(() => {
      nativeChangeListener?.({
        payload: { token: 16, path: "/docs/current.md" },
      });
      nativeChangeListener?.({
        payload: { token: 17, path: "/docs/other.md" },
      });
    });
    await new Promise((resolve) => window.setTimeout(resolve, 100));
    expect(getMarkdownFileStatus).toHaveBeenCalledOnce();

    act(() => {
      nativeChangeListener?.({
        payload: { token: 17, path: "/docs/current.md" },
      });
    });
    await waitFor(() => expect(getMarkdownFileStatus).toHaveBeenCalledTimes(2));
    unmount();
    expect(unwatchMarkdownFile).toHaveBeenCalledWith(17);
  });
});
