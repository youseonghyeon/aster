import { getReadingFocusOffset } from "./reading-viewport";

export type PreviewScrollAnchorSnapshot = {
  container: HTMLElement;
  sourceOffset: string | null;
  topDelta: number;
  scrollTop: number;
};

export type PreviewReadingAnchorSnapshot = {
  container: HTMLElement;
  sourceOffset: string | null;
  blockProgress: number;
  viewportOffset: number;
  scrollProgress: number;
  scrollTop: number;
};

function clampUnit(value: number) {
  return Math.min(1, Math.max(0, value));
}

function getDistanceFromViewportOffset(
  element: HTMLElement,
  containerTop: number,
  viewportOffset: number,
) {
  const rect = element.getBoundingClientRect();
  const top = rect.top - containerTop;
  const bottom = rect.bottom - containerTop;

  if (viewportOffset < top) return top - viewportOffset;
  if (viewportOffset > bottom) return viewportOffset - bottom;
  return 0;
}

function getAnchorTopDelta(anchor: HTMLElement, container: HTMLElement) {
  return (
    anchor.getBoundingClientRect().top -
    container.getBoundingClientRect().top
  );
}

export function capturePreviewScrollAnchor(
  descendant: HTMLElement,
): PreviewScrollAnchorSnapshot | null {
  const container = descendant.closest<HTMLElement>(".preview-scroll");
  if (!container) return null;

  const anchors = Array.from(
    container.querySelectorAll<HTMLElement>("[data-source-offset]"),
  );
  const anchor = anchors.reduce<HTMLElement | null>((best, candidate) => {
    if (!best) return candidate;
    const candidateDelta = getAnchorTopDelta(candidate, container);
    const bestDelta = getAnchorTopDelta(best, container);
    return Math.abs(candidateDelta) < Math.abs(bestDelta) ? candidate : best;
  }, null);

  return {
    container,
    sourceOffset: anchor?.getAttribute("data-source-offset") ?? null,
    topDelta: anchor ? getAnchorTopDelta(anchor, container) : 0,
    scrollTop: container.scrollTop,
  };
}

export function restorePreviewScrollAnchor(
  snapshot: PreviewScrollAnchorSnapshot,
) {
  const { container, sourceOffset, topDelta, scrollTop } = snapshot;
  if (!container.isConnected) return;

  const anchors = Array.from(
    container.querySelectorAll<HTMLElement>("[data-source-offset]"),
  ).filter(
    (anchor) => anchor.getAttribute("data-source-offset") === sourceOffset,
  );
  const anchor = anchors.reduce<HTMLElement | null>((best, candidate) => {
    if (!best) return candidate;
    return Math.abs(getAnchorTopDelta(candidate, container) - topDelta) <
      Math.abs(getAnchorTopDelta(best, container) - topDelta)
      ? candidate
      : best;
  }, null);

  if (!sourceOffset || !anchor) {
    container.scrollTop = scrollTop;
    return;
  }

  container.scrollTop += getAnchorTopDelta(anchor, container) - topDelta;
}

export function capturePreviewReadingAnchor(
  container: HTMLElement,
): PreviewReadingAnchorSnapshot {
  const containerRect = container.getBoundingClientRect();
  const viewportOffset = getReadingFocusOffset(container.clientHeight);
  const anchors = Array.from(
    container.querySelectorAll<HTMLElement>("[data-source-offset]"),
  );
  const anchor = anchors.reduce<HTMLElement | null>((best, candidate) => {
    if (!best) return candidate;

    const candidateDistance = getDistanceFromViewportOffset(
      candidate,
      containerRect.top,
      viewportOffset,
    );
    const bestDistance = getDistanceFromViewportOffset(
      best,
      containerRect.top,
      viewportOffset,
    );

    if (candidateDistance !== bestDistance) {
      return candidateDistance < bestDistance ? candidate : best;
    }

    return candidate.getBoundingClientRect().height <
      best.getBoundingClientRect().height
      ? candidate
      : best;
  }, null);
  const anchorRect = anchor?.getBoundingClientRect();
  const anchorTop = anchorRect ? anchorRect.top - containerRect.top : 0;
  const blockProgress = anchorRect?.height
    ? clampUnit((viewportOffset - anchorTop) / anchorRect.height)
    : 0;
  const maximumScrollTop = Math.max(
    0,
    container.scrollHeight - container.clientHeight,
  );

  return {
    container,
    sourceOffset: anchor?.getAttribute("data-source-offset") ?? null,
    blockProgress,
    viewportOffset,
    scrollProgress:
      maximumScrollTop > 0 ? container.scrollTop / maximumScrollTop : 0,
    scrollTop: container.scrollTop,
  };
}

export function restorePreviewReadingAnchor(
  snapshot: PreviewReadingAnchorSnapshot,
) {
  const {
    container,
    sourceOffset,
    blockProgress,
    viewportOffset,
    scrollProgress,
    scrollTop,
  } = snapshot;
  if (!container.isConnected) return;

  const containerTop = container.getBoundingClientRect().top;
  const anchors = sourceOffset
    ? Array.from(
        container.querySelectorAll<HTMLElement>("[data-source-offset]"),
      ).filter(
        (anchor) => anchor.getAttribute("data-source-offset") === sourceOffset,
      )
    : [];
  const anchor = anchors.reduce<HTMLElement | null>((best, candidate) => {
    if (!best) return candidate;

    const candidateRect = candidate.getBoundingClientRect();
    const bestRect = best.getBoundingClientRect();
    const candidatePoint =
      candidateRect.top - containerTop + candidateRect.height * blockProgress;
    const bestPoint =
      bestRect.top - containerTop + bestRect.height * blockProgress;

    return Math.abs(candidatePoint - viewportOffset) <
      Math.abs(bestPoint - viewportOffset)
      ? candidate
      : best;
  }, null);

  if (!anchor) {
    const maximumScrollTop = Math.max(
      0,
      container.scrollHeight - container.clientHeight,
    );
    container.scrollTop =
      maximumScrollTop > 0 ? scrollProgress * maximumScrollTop : scrollTop;
    return;
  }

  const anchorRect = anchor.getBoundingClientRect();
  const anchorPoint =
    anchorRect.top - containerTop + anchorRect.height * blockProgress;
  container.scrollTop += anchorPoint - viewportOffset;
}
