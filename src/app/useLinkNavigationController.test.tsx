import { act, fireEvent, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  openExternalLink,
  readRelativeImage,
  resolveRelativeMarkdownPath,
} from "./link-navigation-gateway";
import { useLinkNavigationController } from "./useLinkNavigationController";
import { createAppEventChannel } from "../shared/app-events";

vi.mock("./link-navigation-gateway", () => ({
  openExternalLink: vi.fn(),
  readRelativeImage: vi.fn(),
  resolveRelativeMarkdownPath: vi.fn(),
}));

vi.mock("../features/documents/markdown-files", () => ({
  showMarkdownMessage: vi.fn(async () => undefined),
}));

function previewElement(path: string) {
  const element = document.createElement("div");
  element.dataset.documentPath = path;
  Object.defineProperty(element, "scrollTo", {
    configurable: true,
    value: ({ top }: ScrollToOptions) => {
      element.scrollTop = top ?? 0;
      fireEvent.scroll(element);
    },
  });
  document.body.append(element);
  return element;
}

describe("link navigation controller", () => {
  beforeEach(() => {
    vi.mocked(openExternalLink).mockReset();
    vi.mocked(readRelativeImage).mockReset();
    vi.mocked(resolveRelativeMarkdownPath).mockReset();
  });

  it("records same-document anchors and truncates forward history after a new move", async () => {
    const element = previewElement("/docs/a.md");
    const first = document.createElement("h2");
    first.dataset.markdownAnchor = "first";
    const second = document.createElement("h2");
    second.dataset.markdownAnchor = "second";
    element.append(first, second);
    const openDocument = vi.fn(async () => "opened" as const);
    const events = createAppEventChannel();
    const { result } = renderHook(() =>
      useLinkNavigationController({
        events,
        documentPath: "/docs/a.md",
        previewDocumentPath: "/docs/a.md",
        previewElement: element,
        openDocument,
      }),
    );

    await act(async () => result.current.activateLink("#first"));
    expect(result.current.canGoBack).toBe(true);
    await act(async () => result.current.goBack());
    expect(result.current.canGoBack).toBe(false);
    expect(result.current.canGoForward).toBe(true);

    await act(async () => result.current.activateLink("#second"));
    expect(result.current.canGoBack).toBe(true);
    expect(result.current.canGoForward).toBe(false);
    expect(openDocument).not.toHaveBeenCalled();
  });

  it("opens relative documents through the existing transaction and moves through history", async () => {
    const element = previewElement("/docs/a.md");
    const openDocument = vi.fn(async () => "opened" as const);
    const events = createAppEventChannel();
    vi.mocked(resolveRelativeMarkdownPath).mockResolvedValue("/docs/b.md");
    const { result, rerender } = renderHook(
      ({ path }) =>
        useLinkNavigationController({
          events,
          documentPath: path,
          previewDocumentPath: path,
          previewElement: element,
          openDocument,
        }),
      { initialProps: { path: "/docs/a.md" } },
    );

    await act(async () => result.current.activateLink("./b.md#details"));
    element.dataset.documentPath = "/docs/b.md";
    rerender({ path: "/docs/b.md" });
    expect(openDocument).toHaveBeenCalledWith("/docs/b.md", "link");
    expect(result.current.canGoBack).toBe(true);

    await act(async () => result.current.goBack());
    expect(openDocument).toHaveBeenLastCalledWith("/docs/a.md", "history");
    element.dataset.documentPath = "/docs/a.md";
    rerender({ path: "/docs/a.md" });
    expect(result.current.canGoForward).toBe(true);
  });

  it("keeps the history index when a document transaction is cancelled", async () => {
    const element = previewElement("/docs/a.md");
    vi.mocked(resolveRelativeMarkdownPath).mockResolvedValue("/docs/b.md");
    const openDocument = vi.fn(async () => "cancelled" as const);
    const events = createAppEventChannel();
    const { result } = renderHook(() =>
      useLinkNavigationController({
        events,
        documentPath: "/docs/a.md",
        previewDocumentPath: "/docs/a.md",
        previewElement: element,
        openDocument,
      }),
    );

    await act(async () => result.current.activateLink("./b.md"));

    expect(result.current.canGoBack).toBe(false);
    expect(result.current.canGoForward).toBe(false);
  });

  it("uses the latest document path for a reused relative image source", async () => {
    const element = previewElement("/docs/a.md");
    vi.mocked(readRelativeImage).mockResolvedValue("data:image/png;base64,AA==");
    const openDocument = vi.fn(async () => "opened" as const);
    const events = createAppEventChannel();
    const { result, rerender } = renderHook(
      ({ path }) =>
        useLinkNavigationController({
          events,
          documentPath: path,
          previewDocumentPath: path,
          previewElement: element,
          openDocument,
        }),
      { initialProps: { path: "/docs/a.md" } },
    );

    await act(async () => result.current.resolveRelativeImage("./cover.png"));
    element.dataset.documentPath = "/docs/b.md";
    rerender({ path: "/docs/b.md" });
    await act(async () => result.current.resolveRelativeImage("./cover.png"));

    expect(readRelativeImage).toHaveBeenNthCalledWith(1, "/docs/a.md", "./cover.png");
    expect(readRelativeImage).toHaveBeenNthCalledWith(2, "/docs/b.md", "./cover.png");
  });
});
