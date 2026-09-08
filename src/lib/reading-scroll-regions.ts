import { getPreviewScrollRegions } from "./preview-scroll-regions";

type ReadingScrollRegion = {
  sourceOffset: string | null;
  kind: string;
  element: HTMLElement;
  top: number;
  left: number;
};

function regionIdentity(element: HTMLElement) {
  const anchor = element.closest<HTMLElement>("[data-source-offset]");
  return {
    sourceOffset: anchor?.dataset.sourceOffset ?? null,
    kind: element.matches("pre") ? "code" : element.matches(".table-scroll") ? "table" : "diagram",
  };
}

export function captureReadingScrollRegions(container: HTMLElement): ReadingScrollRegion[] {
  return getPreviewScrollRegions(container).filter(element => element.scrollTop !== 0 || element.scrollLeft !== 0).map(element => ({
    ...regionIdentity(element), element, top: element.scrollTop, left: element.scrollLeft,
  }));
}

export function remapReadingScrollRegions(
  regions: ReadingScrollRegion[],
  mapOffset: (offset: number) => number | null,
) {
  return regions.flatMap(region => {
    const offset = region.sourceOffset === null ? null : mapOffset(Number(region.sourceOffset));
    return offset === null ? [] : [{ ...region, sourceOffset: String(offset) }];
  });
}

export function restoreReadingScrollRegions(container: HTMLElement, regions: ReadingScrollRegion[]) {
  const candidates = new Map<string, HTMLElement>();
  for (const candidate of getPreviewScrollRegions(container)) {
    const identity = regionIdentity(candidate);
    const key = `${identity.kind}:${identity.sourceOffset}`;
    if (!candidates.has(key)) candidates.set(key, candidate);
  }
  for (const region of regions) {
    const element = region.sourceOffset === null
      ? (container.contains(region.element) ? region.element : undefined)
      : candidates.get(`${region.kind}:${region.sourceOffset}`);
    if (element) {
      element.scrollTop = region.top;
      element.scrollLeft = region.left;
    }
  }
}
