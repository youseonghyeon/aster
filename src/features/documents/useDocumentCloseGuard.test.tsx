import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { listen } from "@tauri-apps/api/event";
import {
  enableCloseGuard,
  resolveCloseRequest,
} from "./markdown-files";
import { useDocumentCloseGuard } from "./useDocumentCloseGuard";

let closeListener:
  | ((event: { payload: number }) => void | Promise<void>)
  | undefined;

vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn(async (_event, listener) => {
    closeListener = listener;
    return () => undefined;
  }),
}));

vi.mock("./markdown-files", () => ({
  enableCloseGuard: vi.fn(async () => undefined),
  isDesktopRuntime: vi.fn(() => true),
  resolveCloseRequest: vi.fn(async () => undefined),
}));

function deferred<T>() {
  let resolve: (value: T) => void = () => undefined;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

describe("useDocumentCloseGuard", () => {
  beforeEach(() => {
    closeListener = undefined;
    vi.mocked(listen).mockClear();
    vi.mocked(enableCloseGuard).mockClear();
    vi.mocked(resolveCloseRequest).mockClear();
  });

  it("resolves an approved close with the matching request and draft fence", async () => {
    const decideClose = vi.fn(async () => ({
      allow: true,
      discardDraft: { identity: "file:/docs/one.md", sequence: 7 },
    }));
    renderHook(() => useDocumentCloseGuard(decideClose));
    await waitFor(() => expect(enableCloseGuard).toHaveBeenCalledOnce());

    await act(async () => {
      await closeListener?.({ payload: 23 });
    });

    expect(resolveCloseRequest).toHaveBeenCalledWith({
      requestId: 23,
      allow: true,
      discardDraft: { identity: "file:/docs/one.md", sequence: 7 },
    });
  });

  it("coalesces frontend close events while a decision is pending", async () => {
    const decision = deferred<{ allow: boolean }>();
    const decideClose = vi.fn(() => decision.promise);
    renderHook(() => useDocumentCloseGuard(decideClose));
    await waitFor(() => expect(enableCloseGuard).toHaveBeenCalledOnce());

    let firstRequest: void | Promise<void> | undefined;
    act(() => {
      firstRequest = closeListener?.({ payload: 31 });
      void closeListener?.({ payload: 32 });
    });
    expect(decideClose).toHaveBeenCalledOnce();
    decision.resolve({ allow: false });
    await act(async () => {
      await firstRequest;
    });

    expect(resolveCloseRequest).toHaveBeenCalledOnce();
    expect(resolveCloseRequest).toHaveBeenCalledWith({
      requestId: 31,
      allow: false,
    });
  });
});
