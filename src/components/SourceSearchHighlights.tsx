import {
  forwardRef,
  memo,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  type ReactNode,
  type RefObject,
} from "react";
import {
  normalizeSearchIndex,
  type TextSearchMatch,
} from "../lib/text-search";

export type SourceSearchSegment =
  | { kind: "text"; text: string }
  | {
      kind: "match";
      index: number;
      text: string;
      isZeroWidth: boolean;
    };

export type SourceSearchHighlightsHandle = {
  syncToTextarea: (textarea: HTMLTextAreaElement) => void;
  syncScrollToTextarea: (textarea: HTMLTextAreaElement) => void;
  scrollCurrentMatchIntoView: (textarea: HTMLTextAreaElement) => boolean;
};

export const maximumRenderedSourceSearchMatches = 2_000;

const SourceSearchHighlightContent = memo(function SourceSearchHighlightContent({
  contentRef,
  renderedSegments,
}: {
  contentRef: RefObject<HTMLDivElement | null>;
  renderedSegments: ReactNode[];
}) {
  return (
    <div ref={contentRef} className="source-search-highlights-content">
      {renderedSegments}
      <span className="source-search-highlight-sentinel">{"\u200b"}</span>
    </div>
  );
});

export function createSourceSearchSegments(
  value: string,
  matches: TextSearchMatch[],
  matchIndexOffset = 0,
): SourceSearchSegment[] {
  const segments: SourceSearchSegment[] = [];
  let cursor = 0;

  matches.forEach((match, index) => {
    const start = Math.max(cursor, Math.min(value.length, match.start));
    const end = Math.max(start, Math.min(value.length, match.end));

    if (start > cursor) {
      segments.push({ kind: "text", text: value.slice(cursor, start) });
    }

    segments.push({
      kind: "match",
      index: matchIndexOffset + index,
      text: value.slice(start, end),
      isZeroWidth: start === end,
    });
    cursor = end;
  });

  if (cursor < value.length) {
    segments.push({ kind: "text", text: value.slice(cursor) });
  }

  return segments;
}

export const SourceSearchHighlights = forwardRef<
  SourceSearchHighlightsHandle,
  {
    area: "editor" | "notes";
    value: string;
    matches: TextSearchMatch[];
    currentIndex: number;
  }
>(function SourceSearchHighlights(
  { area, value, matches, currentIndex },
  forwardedRef,
) {
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const contentRef = useRef<HTMLDivElement | null>(null);
  const matchElementsRef = useRef<Array<HTMLSpanElement | null>>([]);
  const currentElementRef = useRef<HTMLSpanElement | null>(null);
  const activeIndex = normalizeSearchIndex(currentIndex, matches.length);
  const visibleBlockStart =
    Math.floor(activeIndex / maximumRenderedSourceSearchMatches) *
    maximumRenderedSourceSearchMatches;
  const visibleMatches = useMemo(
    () =>
      matches.slice(
        visibleBlockStart,
        visibleBlockStart + maximumRenderedSourceSearchMatches,
      ),
    [matches, visibleBlockStart],
  );
  const renderedSegments = useMemo(
    () =>
      createSourceSearchSegments(
        value,
        visibleMatches,
        visibleBlockStart,
      ).map((segment, segmentIndex) =>
        segment.kind === "text" ? (
          segment.text
        ) : (
          <span
            key={`${segment.index}-${segmentIndex}`}
            ref={(element) => {
              matchElementsRef.current[segment.index] = element;
            }}
            className={`source-search-highlight${segment.isZeroWidth ? " is-zero-width" : ""}`}
            data-source-search-match={segment.index}
          >
            {segment.text}
          </span>
        ),
      ),
    [value, visibleBlockStart, visibleMatches],
  );

  function syncScrollToTextarea(textarea: HTMLTextAreaElement) {
    const content = contentRef.current;

    if (!content) {
      return;
    }

    content.style.transform = `translate3d(${-textarea.scrollLeft}px, ${-textarea.scrollTop}px, 0)`;
  }

  function syncToTextarea(textarea: HTMLTextAreaElement) {
    const viewport = viewportRef.current;
    const content = contentRef.current;

    if (!viewport || !content) {
      return;
    }

    const width = `${textarea.clientWidth}px`;
    const height = `${textarea.clientHeight}px`;
    if (viewport.style.width !== width) viewport.style.width = width;
    if (viewport.style.height !== height) viewport.style.height = height;
    if (content.style.width !== width) content.style.width = width;
    if (content.style.minHeight !== height) content.style.minHeight = height;
    syncScrollToTextarea(textarea);
  }

  useLayoutEffect(() => {
    currentElementRef.current?.classList.remove("is-current");
    const currentElement = matchElementsRef.current[activeIndex] ?? null;
    currentElement?.classList.add("is-current");
    currentElementRef.current = currentElement;
  }, [activeIndex, renderedSegments]);

  useImperativeHandle(
    forwardedRef,
    () => ({
      syncToTextarea,
      syncScrollToTextarea,
      scrollCurrentMatchIntoView(textarea) {
        const currentElement = currentElementRef.current;

        if (!currentElement) {
          return false;
        }

        const lineHeight = Number.parseFloat(
          window.getComputedStyle(textarea).lineHeight,
        );
        const matchHeight = Math.max(
          currentElement.offsetHeight,
          Number.isFinite(lineHeight) ? lineHeight : 0,
        );
        textarea.scrollTop = Math.max(
          0,
          currentElement.offsetTop -
            textarea.clientHeight / 2 +
            matchHeight / 2,
        );
        syncScrollToTextarea(textarea);
        return true;
      },
    }),
    [],
  );

  return (
    <div
      ref={viewportRef}
      className="source-search-highlights"
      data-source-search-highlights={area}
      aria-hidden="true"
    >
      <SourceSearchHighlightContent
        contentRef={contentRef}
        renderedSegments={renderedSegments}
      />
    </div>
  );
});
