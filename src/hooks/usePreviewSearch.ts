import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { normalizeSearchIndex, type SearchSession } from "../lib/text-search";
import { useTextSearch } from "./useTextSearch";

const matchHighlightName = "aster-preview-search-match";
const currentHighlightName = "aster-preview-search-current";
const searchExcludedSelector =
  "style, script, defs, title, desc, [hidden], [aria-hidden='true'], [display='none'], [visibility='hidden'], [visibility='collapse'], [data-preview-search-ignore]";

type TextSegment = {
  node: Text;
  start: number;
  end: number;
  nodeStart: number;
  nodeEnd: number;
};

type PreviewTextIndex = {
  text: string;
  segments: TextSegment[];
};

const blockElementNames = new Set([
  "ADDRESS",
  "BLOCKQUOTE",
  "DIV",
  "H1",
  "H2",
  "H3",
  "H4",
  "H5",
  "H6",
  "LI",
  "P",
  "PRE",
  "TABLE",
  "TD",
  "TH",
  "TR",
]);

export type PreviewSearchOverlay = {
  id: string;
  top: number;
  left: number;
  width: number;
  height: number;
  isCurrent: boolean;
};

function canUseCustomHighlights(): boolean {
  return (
    typeof CSS !== "undefined" &&
    "highlights" in CSS &&
    typeof Highlight !== "undefined"
  );
}

export function createPreviewTextIndex(
  container: HTMLDivElement,
): PreviewTextIndex {
  const root = container.querySelector<HTMLElement>(".markdown-body");

  if (!root) {
    return { text: "", segments: [] };
  }

  const visibilityCache = new WeakMap<Element, boolean>();
  const isHiddenFromSearch = (element: Element | null) => {
    let current = element;

    while (current && current !== container) {
      let isHidden = visibilityCache.get(current);

      if (isHidden === undefined) {
        const style = window.getComputedStyle(current);
        isHidden =
          current.matches(searchExcludedSelector) ||
          style.display === "none" ||
          style.visibility === "hidden" ||
          style.visibility === "collapse";
        visibilityCache.set(current, isHidden);
      }

      if (isHidden) return true;
      current = current.parentElement;
    }

    return false;
  };

  const walker = document.createTreeWalker(
    root,
    NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT,
    {
      acceptNode(node) {
        if (node instanceof Element && isHiddenFromSearch(node)) {
          return NodeFilter.FILTER_REJECT;
        }

        if (node instanceof Text && isHiddenFromSearch(node.parentElement)) {
          return NodeFilter.FILTER_REJECT;
        }

        return NodeFilter.FILTER_ACCEPT;
      },
    },
  );
  const segments: TextSegment[] = [];
  const textParts: string[] = [];
  const whiteSpaceCache = new WeakMap<Element, string>();
  let offset = 0;
  let previousBlock: Element | null = null;
  let afterSeparator = false;
  let lastWasCollapsibleWhitespace = false;
  let node = walker.nextNode();

  const appendSeparator = () => {
    if (
      offset === 0 ||
      textParts[textParts.length - 1]?.endsWith("\n")
    ) {
      afterSeparator = true;
      lastWasCollapsibleWhitespace = false;
      return;
    }

    textParts.push("\n");
    offset += 1;
    afterSeparator = true;
    lastWasCollapsibleWhitespace = false;
  };

  const appendMappedText = (
    textNode: Text,
    value: string,
    nodeStart: number,
    nodeEnd: number,
  ) => {
    textParts.push(value);
    segments.push({
      node: textNode,
      start: offset,
      end: offset + value.length,
      nodeStart,
      nodeEnd,
    });
    offset += value.length;
  };

  while (node) {
    if (node instanceof HTMLBRElement) {
      appendSeparator();
      node = walker.nextNode();
      continue;
    }

    if (!(node instanceof Text)) {
      node = walker.nextNode();
      continue;
    }

    const textNode = node as Text;
    const value = textNode.data;

    if (value.length > 0) {
      let block = textNode.parentElement;

      while (
        block &&
        block !== root &&
        !blockElementNames.has(block.tagName)
      ) {
        block = block.parentElement;
      }

      if (previousBlock && block && block !== previousBlock) {
        appendSeparator();
      }

      const whiteSpaceHost = block ?? root;
      let whiteSpace = whiteSpaceCache.get(whiteSpaceHost);

      if (!whiteSpace) {
        whiteSpace = window.getComputedStyle(whiteSpaceHost).whiteSpace;
        whiteSpaceCache.set(whiteSpaceHost, whiteSpace);
      }
      const preservesWhitespace =
        whiteSpace === "pre" ||
        whiteSpace === "pre-wrap" ||
        whiteSpace === "break-spaces";

      if (preservesWhitespace) {
        appendMappedText(textNode, value, 0, value.length);
        afterSeparator = value.endsWith("\n");
        lastWasCollapsibleWhitespace = false;
      } else {
        const runs = value.matchAll(/[ \t\n\f\r]+|[^ \t\n\f\r]+/gu);

        for (const run of runs) {
          const runValue = run[0];
          const nodeStart = run.index;
          const nodeEnd = nodeStart + runValue.length;
          const isWhitespace = /^[ \t\n\f\r]+$/u.test(runValue);

          if (isWhitespace) {
            if (!afterSeparator && !lastWasCollapsibleWhitespace) {
              appendMappedText(textNode, " ", nodeStart, nodeEnd);
              lastWasCollapsibleWhitespace = true;
            }
            continue;
          }

          appendMappedText(textNode, runValue, nodeStart, nodeEnd);
          afterSeparator = false;
          lastWasCollapsibleWhitespace = false;
        }
      }

      previousBlock = block;
    }

    node = walker.nextNode();
  }

  return { text: textParts.join(""), segments };
}

function findSegmentIndex(
  segments: TextSegment[],
  offset: number,
  preferPrevious: boolean,
): number {
  let low = 0;
  let high = segments.length - 1;

  while (low <= high) {
    const middle = Math.floor((low + high) / 2);
    const segment = segments[middle];

    if (offset < segment.start) {
      high = middle - 1;
    } else if (offset > segment.end || (!preferPrevious && offset === segment.end)) {
      low = middle + 1;
    } else {
      return middle;
    }
  }

  return preferPrevious ? Math.max(0, high) : Math.min(segments.length - 1, low);
}

function createRange(
  index: PreviewTextIndex,
  start: number,
  end: number,
): Range | null {
  if (index.segments.length === 0) {
    return null;
  }

  const startIndex = findSegmentIndex(index.segments, start, false);
  const endIndex = findSegmentIndex(index.segments, end, true);
  const startSegment = index.segments[startIndex];
  const endSegment = index.segments[endIndex];

  if (!startSegment?.node.isConnected || !endSegment?.node.isConnected) {
    return null;
  }

  const range = document.createRange();
  const startLength = startSegment.end - startSegment.start;
  const startNodeLength = startSegment.nodeEnd - startSegment.nodeStart;
  const endLength = endSegment.end - endSegment.start;
  const endNodeLength = endSegment.nodeEnd - endSegment.nodeStart;
  const startOffset =
    startLength === startNodeLength
      ? startSegment.nodeStart + start - startSegment.start
      : start <= startSegment.start
        ? startSegment.nodeStart
        : startSegment.nodeEnd;
  const endOffset =
    endLength === endNodeLength
      ? endSegment.nodeStart + end - endSegment.start
      : end >= endSegment.end
        ? endSegment.nodeEnd
        : endSegment.nodeStart;
  range.setStart(
    startSegment.node,
    Math.max(0, Math.min(startSegment.node.length, startOffset)),
  );
  range.setEnd(
    endSegment.node,
    Math.max(0, Math.min(endSegment.node.length, endOffset)),
  );
  return range;
}

function scrollRangeWithinElement(
  range: Range,
  element: HTMLElement,
  centerVertically: boolean,
) {
  const rangeBounds = range.getBoundingClientRect();
  const elementBounds = element.getBoundingClientRect();
  const inset = 12;

  if (rangeBounds.width > element.clientWidth - inset * 2) {
    element.scrollLeft += rangeBounds.left - elementBounds.left - inset;
  } else if (rangeBounds.left < elementBounds.left + inset) {
    element.scrollLeft += rangeBounds.left - elementBounds.left - inset;
  } else if (rangeBounds.right > elementBounds.right - inset) {
    element.scrollLeft += rangeBounds.right - elementBounds.right + inset;
  }

  if (centerVertically) {
    element.scrollTop +=
      rangeBounds.top -
      elementBounds.top -
      element.clientHeight / 2 +
      rangeBounds.height / 2;
  } else if (rangeBounds.top < elementBounds.top + inset) {
    element.scrollTop += rangeBounds.top - elementBounds.top - inset;
  } else if (rangeBounds.bottom > elementBounds.bottom - inset) {
    element.scrollTop += rangeBounds.bottom - elementBounds.bottom + inset;
  }
}

function scrollPreviewRangeIntoView(
  range: Range,
  container: HTMLDivElement,
) {
  let ancestor = range.startContainer.parentElement;

  while (ancestor && ancestor !== container) {
    if (
      ancestor.scrollWidth > ancestor.clientWidth ||
      ancestor.scrollHeight > ancestor.clientHeight
    ) {
      scrollRangeWithinElement(range, ancestor, false);
    }

    ancestor = ancestor.parentElement;
  }

  scrollRangeWithinElement(range, container, true);
}

function getClippedRangeRects(
  range: Range,
  container: HTMLDivElement,
): Array<{ top: number; left: number; width: number; height: number }> {
  const clippingBounds = [container.getBoundingClientRect()];
  let ancestor =
    range.commonAncestorContainer instanceof Element
      ? range.commonAncestorContainer
      : range.commonAncestorContainer.parentElement;

  while (ancestor && ancestor !== container) {
    if (
      ancestor.scrollWidth > ancestor.clientWidth ||
      ancestor.scrollHeight > ancestor.clientHeight
    ) {
      clippingBounds.push(ancestor.getBoundingClientRect());
    }

    ancestor = ancestor.parentElement;
  }

  return Array.from(range.getClientRects()).flatMap((bounds) => {
    let left = bounds.left;
    let right = bounds.right;
    let top = bounds.top;
    let bottom = bounds.bottom;

    for (const clipBounds of clippingBounds) {
      left = Math.max(left, clipBounds.left);
      right = Math.min(right, clipBounds.right);
      top = Math.max(top, clipBounds.top);
      bottom = Math.min(bottom, clipBounds.bottom);
    }

    return right > left && bottom > top
      ? [{ top, left, width: right - left, height: bottom - top }]
      : [];
  });
}

export function usePreviewSearch(
  container: HTMLDivElement | null,
  contentRevision: string,
  session: SearchSession,
) {
  const [textIndex, setTextIndex] = useState<PreviewTextIndex>({
    text: "",
    segments: [],
  });
  const [indexedContentRevision, setIndexedContentRevision] =
    useState(contentRevision);
  const [renderRevision, setRenderRevision] = useState(0);
  const [scrollRevision, setScrollRevision] = useState(0);
  const [overlays, setOverlays] = useState<PreviewSearchOverlay[]>([]);
  const lastHandledNavigationKeyRef = useRef("");
  const currentNavigationKeyRef = useRef("");
  const suppressedRenderNavigationKeyRef = useRef("");
  const options = useMemo(
    () => ({
      isCaseSensitive: session.isCaseSensitive,
      isRegex: session.isRegex,
    }),
    [session.isCaseSensitive, session.isRegex],
  );
  const result = useTextSearch(
    textIndex.text,
    session.isOpen ? session.query : "",
    options,
  );
  const navigationKey = `${session.isOpen}:${session.query}:${session.isCaseSensitive}:${session.isRegex}:${session.currentIndex}`;
  currentNavigationKeyRef.current = navigationKey;

  useEffect(() => {
    if (!container || !session.isOpen) {
      return;
    }

    const markdownBody = container.querySelector(".markdown-body");

    if (!markdownBody) {
      return;
    }

    let scheduledFrame: number | null = null;
    const scheduleReindex = (suppressNavigation: boolean) => {
      if (suppressNavigation) {
        suppressedRenderNavigationKeyRef.current =
          currentNavigationKeyRef.current;
      }
      if (scheduledFrame !== null) {
        return;
      }

      scheduledFrame = window.requestAnimationFrame(() => {
        scheduledFrame = null;
        setRenderRevision((revision) => revision + 1);
      });
    };
    const mutationObserver = new MutationObserver(() => scheduleReindex(true));
    const resizeObserver = new ResizeObserver(() => scheduleReindex(false));
    const handleScroll = () => {
      if (!canUseCustomHighlights()) {
        setScrollRevision((revision) => revision + 1);
      }
    };
    mutationObserver.observe(markdownBody, {
      childList: true,
      characterData: true,
      subtree: true,
    });
    resizeObserver.observe(markdownBody);
    container.addEventListener("scroll", handleScroll, true);

    return () => {
      if (scheduledFrame !== null) {
        window.cancelAnimationFrame(scheduledFrame);
      }
      mutationObserver.disconnect();
      resizeObserver.disconnect();
      container.removeEventListener("scroll", handleScroll, true);
    };
  }, [container, session.isOpen]);

  useLayoutEffect(() => {
    if (!container || !session.isOpen) {
      setTextIndex({ text: "", segments: [] });
      return;
    }

    setTextIndex(createPreviewTextIndex(container));
    setIndexedContentRevision(contentRevision);
  }, [container, contentRevision, renderRevision, session.isOpen]);

  useLayoutEffect(() => {
    if (!container) {
      return;
    }

    if (!session.isOpen) {
      lastHandledNavigationKeyRef.current = navigationKey;
      return;
    }

    if (indexedContentRevision !== contentRevision) return;

    if (lastHandledNavigationKeyRef.current === navigationKey) {
      return;
    }

    if (result.isPending) return;

    lastHandledNavigationKeyRef.current = navigationKey;
    if (suppressedRenderNavigationKeyRef.current === navigationKey) {
      suppressedRenderNavigationKeyRef.current = "";
      return;
    }
    if (result.error || result.matches.length === 0) return;

    const activeIndex = normalizeSearchIndex(
      session.currentIndex,
      result.matches.length,
    );
    const activeMatch = result.matches[activeIndex];
    const currentRange = createRange(
      textIndex,
      activeMatch.start,
      activeMatch.end,
    );

    if (currentRange) {
      scrollPreviewRangeIntoView(currentRange, container);
    }
  }, [
    container,
    contentRevision,
    indexedContentRevision,
    result.error,
    result.isPending,
    result.matches,
    session.currentIndex,
    session.isOpen,
    textIndex,
    navigationKey,
  ]);

  useLayoutEffect(() => {
    if (!container) {
      setOverlays([]);
      return;
    }

    CSS.highlights?.delete(matchHighlightName);
    CSS.highlights?.delete(currentHighlightName);
    setOverlays([]);

    if (
      !session.isOpen ||
      result.error ||
      result.matches.length === 0
    ) {
      return;
    }

    const activeIndex = normalizeSearchIndex(
      session.currentIndex,
      result.matches.length,
    );
    const matchRanges = result.matches.map((match) =>
      createRange(textIndex, match.start, match.end),
    );
    const ranges = matchRanges.filter(
      (range): range is Range => range !== null,
    );
    const currentRange = matchRanges[activeIndex];

    if (!currentRange) {
      return;
    }

    if (canUseCustomHighlights()) {
      CSS.highlights.set(matchHighlightName, new Highlight(...ranges));
      CSS.highlights.set(currentHighlightName, new Highlight(currentRange));
    } else {
      const containerBounds = container.getBoundingClientRect();
      const nextOverlays = matchRanges.flatMap((range, matchIndex) =>
        range
          ? getClippedRangeRects(range, container).map((bounds, rectIndex) => ({
              id: `${matchIndex}-${rectIndex}`,
              top: bounds.top - containerBounds.top + container.scrollTop,
              left: bounds.left - containerBounds.left + container.scrollLeft,
              width: bounds.width,
              height: bounds.height,
              isCurrent: matchIndex === activeIndex,
            }))
          : [],
      );
      setOverlays(nextOverlays);
    }

    return () => {
      CSS.highlights?.delete(matchHighlightName);
      CSS.highlights?.delete(currentHighlightName);
    };
  }, [
    container,
    result.error,
    result.matches,
    scrollRevision,
    session.currentIndex,
    session.isOpen,
    textIndex,
  ]);

  return { ...result, overlays };
}
