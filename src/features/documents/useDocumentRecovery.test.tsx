import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  deleteRecoveryDraft,
  saveRecoveryDraft,
} from "./markdown-files";
import {
  useDocumentRecovery,
  type RecoveryDocumentSnapshot,
} from "./useDocumentRecovery";

vi.mock("./markdown-files", () => ({
  deleteRecoveryDraft: vi.fn(async () => true),
  isDesktopRuntime: vi.fn(() => true),
  loadRecoveryDraft: vi.fn(async () => null),
  saveRecoveryDraft: vi.fn(async () => true),
}));

const dirtySnapshot: RecoveryDocumentSnapshot = {
  identity: "file:/docs/guide.md",
  path: "/docs/guide.md",
  markdown: "# 변경",
  loadedMarkdown: "# 원본",
  revision: "r1",
  generation: 1,
};

describe("document recovery controller", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.mocked(saveRecoveryDraft).mockClear();
    vi.mocked(deleteRecoveryDraft).mockClear();
  });

  afterEach(() => vi.useRealTimers());

  it("writes a file-scoped recovery draft after the debounce", async () => {
    renderHook(() => useDocumentRecovery(dirtySnapshot, vi.fn()));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(250);
    });

    expect(saveRecoveryDraft).toHaveBeenCalledWith(
      expect.objectContaining({
        identity: dirtySnapshot.identity,
        path: dirtySnapshot.path,
        content: dirtySnapshot.markdown,
        baseRevision: dirtySnapshot.revision,
        sequence: expect.any(Number),
      }),
    );
  });

  it("reserves a newer tombstone sequence than an earlier draft write", async () => {
    const { result } = renderHook(() =>
      useDocumentRecovery(dirtySnapshot, vi.fn()),
    );
    await act(async () => {
      await vi.advanceTimersByTimeAsync(250);
    });
    const writtenSequence = vi.mocked(saveRecoveryDraft).mock.calls[0][0].sequence;

    const fence = result.current.reserveDiscardFence();

    expect(fence.identity).toBe(dirtySnapshot.identity);
    expect(fence.sequence).toBeGreaterThan(writtenSequence);
  });

  it("suppresses exit flushes after discard until a new edit is made", async () => {
    const { result, rerender } = renderHook(
      ({ snapshot }) => useDocumentRecovery(snapshot, vi.fn()),
      { initialProps: { snapshot: dirtySnapshot } },
    );

    act(() => {
      result.current.reserveDiscardFence();
      window.dispatchEvent(new Event("blur"));
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(250);
    });
    expect(saveRecoveryDraft).not.toHaveBeenCalled();

    rerender({
      snapshot: { ...dirtySnapshot, markdown: "# 폐기 뒤 새 변경" },
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(250);
    });

    expect(saveRecoveryDraft).toHaveBeenCalledWith(
      expect.objectContaining({ content: "# 폐기 뒤 새 변경" }),
    );
  });
});
