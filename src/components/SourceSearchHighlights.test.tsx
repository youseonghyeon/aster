import { act, createRef } from "react";
import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import {
  createSourceSearchSegments,
  maximumRenderedSourceSearchMatches,
  SourceSearchHighlights,
  type SourceSearchHighlightsHandle,
} from "./SourceSearchHighlights";

describe("source search highlights", () => {
  it("preserves adjacent, surrogate-pair, trailing-newline, and zero-width matches", () => {
    const segments = createSourceSearchSegments("A😀A\n", [
      { start: 0, end: 1 },
      { start: 1, end: 3 },
      { start: 3, end: 4 },
      { start: 5, end: 5 },
    ]);

    expect(
      segments
        .filter((segment) => segment.kind === "match")
        .map((segment) => ({ text: segment.text, isZeroWidth: segment.isZeroWidth })),
    ).toEqual([
      { text: "A", isZeroWidth: false },
      { text: "😀", isZeroWidth: false },
      { text: "A", isZeroWidth: false },
      { text: "", isZeroWidth: true },
    ]);
    expect(segments[segments.length - 2]).toEqual({ kind: "text", text: "\n" });
  });

  it("does not insert text into the flow for a zero-width result", () => {
    const { container } = render(
      <SourceSearchHighlights
        area="editor"
        value="앞뒤"
        matches={[{ start: 1, end: 1 }]}
        currentIndex={0}
      />,
    );

    expect(
      container.querySelector("[data-source-search-match='0']"),
    ).toHaveTextContent("");
  });

  it("moves the current class without replacing match elements", () => {
    const highlightRef = createRef<SourceSearchHighlightsHandle>();
    const matches = [
      { start: 0, end: 3 },
      { start: 4, end: 7 },
    ];
    const { container, rerender } = render(
      <SourceSearchHighlights
        ref={highlightRef}
        area="editor"
        value="hit hit"
        matches={matches}
        currentIndex={0}
      />,
    );
    const initialElements = Array.from(
      container.querySelectorAll<HTMLElement>("[data-source-search-match]"),
    );
    expect(initialElements[0]).toHaveClass("is-current");

    rerender(
      <SourceSearchHighlights
        ref={highlightRef}
        area="editor"
        value="hit hit"
        matches={matches}
        currentIndex={1}
      />,
    );
    const nextElements = Array.from(
      container.querySelectorAll<HTMLElement>("[data-source-search-match]"),
    );

    expect(nextElements[0]).toBe(initialElements[0]);
    expect(nextElements[1]).toBe(initialElements[1]);
    expect(nextElements[0]).not.toHaveClass("is-current");
    expect(nextElements[1]).toHaveClass("is-current");
  });

  it("syncs its client viewport and scroll translation to the textarea", () => {
    const ref = createRef<SourceSearchHighlightsHandle>();
    const { container } = render(
      <SourceSearchHighlights
        ref={ref}
        area="notes"
        value="메모"
        matches={[{ start: 0, end: 2 }]}
        currentIndex={0}
      />,
    );
    const textarea = document.createElement("textarea");
    Object.defineProperties(textarea, {
      clientWidth: { configurable: true, value: 320 },
      clientHeight: { configurable: true, value: 180 },
    });
    textarea.scrollTop = 90;
    textarea.scrollLeft = 14;

    act(() => ref.current?.syncToTextarea(textarea));

    const viewport = container.querySelector<HTMLElement>(
      "[data-source-search-highlights='notes']",
    );
    const content = container.querySelector<HTMLElement>(
      ".source-search-highlights-content",
    );
    expect(viewport).toHaveStyle({ width: "320px", height: "180px" });
    expect(content).toHaveStyle({
      width: "320px",
      minHeight: "180px",
      transform: "translate3d(-14px, -90px, 0)",
    });
  });

  it("bounds a 10,000-match result while keeping the current block stable", () => {
    const highlightRef = createRef<SourceSearchHighlightsHandle>();
    const value = "x ".repeat(10_000);
    const matches = Array.from({ length: 10_000 }, (_, index) => ({
      start: index * 2,
      end: index * 2 + 1,
    }));
    const { container, rerender } = render(
      <SourceSearchHighlights
        ref={highlightRef}
        area="editor"
        value={value}
        matches={matches}
        currentIndex={9_999}
      />,
    );

    expect(container.querySelectorAll("[data-source-search-match]")).toHaveLength(
      maximumRenderedSourceSearchMatches,
    );
    const blockFirstElement = container.querySelector<HTMLElement>(
      "[data-source-search-match='8000']",
    );
    const currentElement = container.querySelector<HTMLElement>(
      "[data-source-search-match='9999']",
    );
    expect(currentElement).toHaveClass("is-current");

    rerender(
      <SourceSearchHighlights
        ref={highlightRef}
        area="editor"
        value={value}
        matches={matches}
        currentIndex={9_998}
      />,
    );

    expect(container.querySelector("[data-source-search-match='8000']")).toBe(
      blockFirstElement,
    );
    expect(container.querySelector("[data-source-search-match='9999']")).toBe(
      currentElement,
    );
    expect(
      container.querySelector("[data-source-search-match='9998']"),
    ).toHaveClass("is-current");

    rerender(
      <SourceSearchHighlights
        ref={highlightRef}
        area="editor"
        value={value}
        matches={matches}
        currentIndex={0}
      />,
    );
    expect(container.querySelector("[data-source-search-match='9998']")).toBeNull();
    expect(container.querySelector("[data-source-search-match='0']")).toHaveClass(
      "is-current",
    );

    rerender(
      <SourceSearchHighlights
        ref={highlightRef}
        area="editor"
        value={value}
        matches={matches}
        currentIndex={1_999}
      />,
    );
    expect(container.querySelector("[data-source-search-match='1999']")).toHaveClass(
      "is-current",
    );

    rerender(
      <SourceSearchHighlights
        ref={highlightRef}
        area="editor"
        value={value}
        matches={matches}
        currentIndex={2_000}
      />,
    );
    const boundaryCurrent = container.querySelector<HTMLElement>(
      "[data-source-search-match='2000']",
    );
    expect(container.querySelector("[data-source-search-match='1999']")).toBeNull();
    expect(boundaryCurrent).toHaveClass("is-current");

    rerender(
      <SourceSearchHighlights
        ref={highlightRef}
        area="editor"
        value={value}
        matches={matches}
        currentIndex={1_999}
      />,
    );
    expect(container.querySelector("[data-source-search-match='2000']")).toBeNull();
    expect(container.querySelector("[data-source-search-match='1999']")).toHaveClass(
      "is-current",
    );

    rerender(
      <SourceSearchHighlights
        ref={highlightRef}
        area="editor"
        value={value}
        matches={matches}
        currentIndex={2_000}
      />,
    );
    const restoredBoundaryCurrent = container.querySelector<HTMLElement>(
      "[data-source-search-match='2000']",
    );

    Object.defineProperty(restoredBoundaryCurrent, "offsetTop", {
      configurable: true,
      value: 900,
    });
    const textarea = document.createElement("textarea");
    Object.defineProperty(textarea, "clientHeight", {
      configurable: true,
      value: 200,
    });
    expect(highlightRef.current?.scrollCurrentMatchIntoView(textarea)).toBe(true);
    expect(textarea.scrollTop).toBeGreaterThan(700);
  });
});
