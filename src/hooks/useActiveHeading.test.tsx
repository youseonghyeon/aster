import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useActiveHeading } from "./useActiveHeading";

function createScrollableOutline() {
  const container = document.createElement("div");
  const first = document.createElement("h1");
  const second = document.createElement("h2");
  first.id = "heading-0";
  second.id = "heading-100";
  container.append(first, second);
  document.body.append(container);
  Object.defineProperties(container, {
    clientHeight: { configurable: true, value: 600 },
    scrollHeight: { configurable: true, value: 1800 },
  });
  container.scrollTop = 300;
  container.getBoundingClientRect = () => ({ top: 100 } as DOMRect);
  first.getBoundingClientRect = () => ({ top: -200 } as DOMRect);
  second.getBoundingClientRect = () => ({ top: 500 } as DOMRect);
  const scrollTo = vi.fn((options: ScrollToOptions) => {
    container.scrollTop = options.top ?? container.scrollTop;
  });
  Object.defineProperty(container, "scrollTo", {
    configurable: true,
    value: scrollTo,
  });

  return { container, scrollTo };
}

function createAnimatedOutline() {
  const container = document.createElement("div");
  const headingPositions = [300, 900, 1500];
  const headings = headingPositions.map((position, index) => {
    const heading = document.createElement(index === 0 ? "h1" : "h2");
    heading.id = `heading-${index}`;
    heading.getBoundingClientRect = () =>
      ({
        top: 100 + position - container.scrollTop,
      }) as DOMRect;
    return heading;
  });
  container.append(...headings);
  document.body.append(container);
  Object.defineProperties(container, {
    clientHeight: { configurable: true, value: 600 },
    scrollHeight: { configurable: true, value: 2400 },
  });
  container.scrollTop = 300;
  container.getBoundingClientRect = () => ({ top: 100 } as DOMRect);
  const scrollTo = vi.fn();
  Object.defineProperty(container, "scrollTo", {
    configurable: true,
    value: scrollTo,
  });

  return { container, scrollTo };
}

async function flushActiveHeadingUpdate() {
  await act(async () => {
    await new Promise<void>((resolve) =>
      window.requestAnimationFrame(() => resolve()),
    );
  });
}

async function movePreviewTo(container: HTMLElement, scrollTop: number) {
  act(() => {
    container.scrollTop = scrollTop;
    container.dispatchEvent(new Event("scroll"));
  });
  await flushActiveHeadingUpdate();
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("active heading navigation", () => {
  it("keeps the active heading viewport-driven throughout smooth navigation", async () => {
    vi.spyOn(window, "matchMedia").mockReturnValue({
      matches: false,
    } as MediaQueryList);
    const { container, scrollTo } = createAnimatedOutline();
    const { result, unmount } = renderHook(() =>
      useActiveHeading(container, ["heading-0", "heading-1", "heading-2"]),
    );
    await flushActiveHeadingUpdate();

    expect(result.current.activeHeadingId).toBe("heading-0");
    act(() => {
      result.current.navigateToHeading("heading-2");
    });

    expect(scrollTo).toHaveBeenCalledWith({ top: 1380, behavior: "smooth" });
    expect(result.current.activeHeadingId).toBe("heading-0");

    await movePreviewTo(container, 780);
    expect(result.current.activeHeadingId).toBe("heading-1");

    await movePreviewTo(container, 1380);
    expect(result.current.activeHeadingId).toBe("heading-2");
    unmount();
    container.remove();
  });

  it("requests the adaptive reading focus line without preselecting the target", () => {
    const { container, scrollTo } = createScrollableOutline();
    const { result, unmount } = renderHook(() =>
      useActiveHeading(container, ["heading-0", "heading-100"]),
    );

    act(() => {
      result.current.navigateToHeading("heading-100");
    });

    expect(scrollTo).toHaveBeenCalledWith({ top: 580, behavior: "auto" });
    expect(result.current.activeHeadingId).toBe("heading-0");
    unmount();
    container.remove();
  });

  it("keeps the first heading active at the start of the document", async () => {
    const { container } = createScrollableOutline();
    container.scrollTop = 0;
    const { result, unmount } = renderHook(() =>
      useActiveHeading(container, ["heading-0", "heading-100"]),
    );

    await act(async () => {
      await new Promise<void>((resolve) =>
        window.requestAnimationFrame(() => resolve()),
      );
    });

    expect(result.current.activeHeadingId).toBe("heading-0");
    unmount();
    container.remove();
  });

  it("does not make a one-line position correction around the focus line", () => {
    const { container, scrollTo } = createScrollableOutline();
    const heading = container.querySelector<HTMLElement>("#heading-100");
    if (!heading) throw new Error("heading fixture is missing");
    heading.getBoundingClientRect = () => ({ top: 238 } as DOMRect);
    const { result, unmount } = renderHook(() =>
      useActiveHeading(container, ["heading-0", "heading-100"]),
    );

    act(() => {
      result.current.navigateToHeading("heading-100");
    });

    expect(scrollTo).not.toHaveBeenCalled();
    expect(result.current.activeHeadingId).toBe("heading-100");
    unmount();
    container.remove();
  });
});
