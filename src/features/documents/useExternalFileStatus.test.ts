import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getMarkdownFileStatus } from "./markdown-files";
import {
  getExternalFileObservation,
  useExternalFileStatus,
} from "./useExternalFileStatus";

vi.mock("./markdown-files", () => ({
  getMarkdownFileStatus: vi.fn(),
}));

function deferred<T>() {
  let resolve: (value: T) => void = () => undefined;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

describe("external file observations", () => {
  beforeEach(() => vi.mocked(getMarkdownFileStatus).mockReset());

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
});
