export type PreviewScrollAnchorSnapshot = {
  container: HTMLElement;
  sourceOffset: string | null;
  topDelta: number;
  scrollTop: number;
};

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
