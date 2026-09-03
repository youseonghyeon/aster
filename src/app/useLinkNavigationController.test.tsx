import { act, fireEvent, renderHook, waitFor } from "@testing-library/react";
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

  it("resolves explicit HTML anchors exactly before falling back to heading slugs", async () => {
    const element = previewElement("/docs/a.md");
    const heading = document.createElement("h2");
    heading.dataset.markdownAnchor = "english-version";
    heading.tabIndex = -1;
    const explicitAnchor = document.createElement("a");
    explicitAnchor.setAttribute("data-markdown-html-id", "English-Version");
    explicitAnchor.tabIndex = -1;
    element.append(heading, explicitAnchor);
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

    await act(async () => result.current.activateLink("#English-Version"));
    await waitFor(() => expect(document.activeElement).toBe(explicitAnchor));

    await act(async () => result.current.activateLink("#ENGLISH-VERSION"));
    await waitFor(() => expect(document.activeElement).toBe(heading));
  });

  it("restores a percent-encoded explicit anchor after opening a relative document", async () => {
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

    await act(async () =>
      result.current.activateLink("./b.md#%ED%95%9C%EA%B8%80%20Anchor"),
    );
    const explicitAnchor = document.createElement("a");
    explicitAnchor.setAttribute("data-markdown-html-name", "한글 Anchor");
    explicitAnchor.tabIndex = -1;
    element.replaceChildren(explicitAnchor);
    element.dataset.documentPath = "/docs/b.md";
    rerender({ path: "/docs/b.md" });

    await waitFor(() => expect(document.activeElement).toBe(explicitAnchor));
    expect(openDocument).toHaveBeenCalledWith("/docs/b.md", "link");
  });

  it("does not add a missing same-document target to navigation history", async () => {
    const element = previewElement("/docs/a.md");
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

    await act(async () => result.current.activateLink("#missing"));

    expect(result.current.canGoBack).toBe(false);
    expect(result.current.canGoForward).toBe(false);
    expect(openDocument).not.toHaveBeenCalled();
  });

  it("restores saved positions for explicit targets through back and forward", async () => {
    const element = previewElement("/docs/a.md");
    const first = document.createElement("a");
    first.setAttribute("data-markdown-html-id", "first");
    first.tabIndex = -1;
    const second = document.createElement("a");
    second.setAttribute("data-markdown-html-id", "second");
    second.tabIndex = -1;
    Object.defineProperty(first, "getBoundingClientRect", {
      configurable: true,
      value: () => ({ top: 100, right: 0, bottom: 100, left: 0, width: 0, height: 0 }),
    });
    Object.defineProperty(second, "getBoundingClientRect", {
      configurable: true,
      value: () => ({ top: 300, right: 0, bottom: 300, left: 0, width: 0, height: 0 }),
    });
    element.append(first, second);
    const events = createAppEventChannel();
    const { result } = renderHook(() =>
      useLinkNavigationController({
        events,
        documentPath: "/docs/a.md",
        previewDocumentPath: "/docs/a.md",
        previewElement: element,
        openDocument: vi.fn(async () => "opened" as const),
      }),
    );

    await act(async () => result.current.activateLink("#first"));
    await waitFor(() => expect(document.activeElement).toBe(first));
    const firstPosition = element.scrollTop;
    await act(async () => result.current.activateLink("#second"));
    await waitFor(() => expect(document.activeElement).toBe(second));
    const secondPosition = element.scrollTop;

    await act(async () => result.current.goBack());
    await waitFor(() => expect(element.scrollTop).toBe(firstPosition));
    await act(async () => result.current.goForward());
    await waitFor(() => expect(element.scrollTop).toBe(secondPosition));
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
