import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { SearchSession } from "../lib/text-search";
import {
  createPreviewTextIndex,
  usePreviewSearch,
} from "./usePreviewSearch";

const { pendingQueries } = vi.hoisted(() => ({
  pendingQueries: new Set<string>(),
}));

vi.mock("./useTextSearch", async () => {
  const { findTextMatches } = await import("../lib/text-search");
  const { useMemo } = await import("react");

  return {
    useTextSearch: (
      value: string,
      query: string,
      options: { isCaseSensitive: boolean; isRegex: boolean },
    ) => {
      const isPending = pendingQueries.has(query);
      return (
      useMemo(
        () =>
          isPending
            ? { matches: [], error: null, isTruncated: false, isPending: true }
            : {
                ...findTextMatches(value, query, options),
                isPending: false,
              },
        [isPending, options.isCaseSensitive, options.isRegex, query, value],
      )
      );
    },
  };
});

Object.defineProperty(Range.prototype, "getClientRects", {
  configurable: true,
  value: () => [],
});
Object.defineProperty(Range.prototype, "getBoundingClientRect", {
  configurable: true,
  value: () => ({
    top: 500,
    right: 100,
    bottom: 520,
    left: 0,
    width: 100,
    height: 20,
    x: 0,
    y: 500,
    toJSON: () => ({}),
  }),
});

const searchSession: SearchSession = {
  isOpen: true,
  query: "새 레이블",
  currentIndex: 0,
  isCaseSensitive: false,
  isRegex: false,
};

function createPreview(markup = "<p>기존 문장</p>") {
  const preview = document.createElement("div");
  preview.innerHTML = `<article class="markdown-body">${markup}</article>`;
  document.body.append(preview);
  return preview;
}

describe("preview search indexing", () => {
  it("excludes SVG metadata while indexing visible diagram labels", () => {
    const preview = createPreview(`
      <svg>
        <style>.secret-token { color: red; }</style>
        <defs><text>defs-secret</text></defs>
        <title>title-secret</title>
        <desc>desc-secret</desc>
        <g style="display: none"><text>display-secret</text></g>
        <g visibility="hidden"><text>visibility-secret</text></g>
        <g style="visibility: collapse"><text>collapse-secret</text></g>
        <text>보이는 레이블</text>
      </svg>
      <p data-preview-search-ignore>loading-secret</p>
    `);

    const index = createPreviewTextIndex(preview);
    expect(index.text).toContain("보이는 레이블");
    expect(index.text).not.toMatch(/secret/u);
    preview.remove();
  });

  it("reindexes an async SVG without moving the current search position", async () => {
    const preview = createPreview();
    preview.scrollTop = 143;
    const { result } = renderHook(() =>
      usePreviewSearch(preview, "revision-1", searchSession),
    );
    await waitFor(() => expect(result.current.matches).toHaveLength(0));

    await act(async () => {
      preview.querySelector(".markdown-body")?.insertAdjacentHTML(
        "beforeend",
        "<svg><text>새 레이블</text></svg>",
      );
      await new Promise<void>((resolve) =>
        window.requestAnimationFrame(() => resolve()),
      );
    });

    await waitFor(() => expect(result.current.matches).toHaveLength(1));
    expect(preview.scrollTop).toBe(143);
    preview.remove();
  });

  it("waits for a pending search before navigating to its first result", async () => {
    const query = "찾을 문장";
    const preview = createPreview(`<p>${query}</p>`);
    preview.scrollTop = 143;
    pendingQueries.add(query);
    const session = { ...searchSession, query };
    const { result, rerender } = renderHook(
      ({ revision }) => usePreviewSearch(preview, revision, session),
      { initialProps: { revision: "revision-1" } },
    );
    await waitFor(() => expect(result.current.isPending).toBe(true));
    expect(preview.scrollTop).toBe(143);

    pendingQueries.delete(query);
    rerender({ revision: "revision-1" });

    await waitFor(() => expect(result.current.matches).toHaveLength(1));
    expect(preview.scrollTop).not.toBe(143);
    preview.remove();
  });
});
