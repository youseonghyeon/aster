export const minimumMermaidZoomPercent = 25;
export const maximumMermaidZoomPercent = 200;
export const mermaidZoomStepPercent = 10;

export type MermaidSvgSize = {
  width: number;
  height: number;
};

export type ScrollViewportMetrics = {
  scrollLeft: number;
  scrollTop: number;
  scrollWidth: number;
  scrollHeight: number;
  clientWidth: number;
  clientHeight: number;
};

export type ScrollViewportCenter = {
  x: number;
  y: number;
};

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value));
}

export function parseMermaidSvgViewBox(
  viewBox: string | null | undefined,
): MermaidSvgSize | null {
  const values = viewBox?.trim().split(/[\s,]+/u).map(Number);

  if (
    values?.length !== 4 ||
    !Number.isFinite(values[2]) ||
    !Number.isFinite(values[3]) ||
    values[2] <= 0 ||
    values[3] <= 0
  ) {
    return null;
  }

  return { width: values[2], height: values[3] };
}

export function getZoomedMermaidSvgSize(
  size: MermaidSvgSize,
  zoomPercent: number,
): MermaidSvgSize {
  return {
    width: Math.ceil((size.width * zoomPercent) / 100),
    height: Math.ceil((size.height * zoomPercent) / 100),
  };
}

export function getZoomedMermaidSvgMarkup(
  svgMarkup: string,
  zoomPercent: number,
) {
  const svgDocument = new DOMParser().parseFromString(
    svgMarkup,
    "image/svg+xml",
  );
  const svg = svgDocument.querySelector<SVGSVGElement>("svg");
  const baseSize = parseMermaidSvgViewBox(svg?.getAttribute("viewBox"));
  if (!svg || !baseSize) return svgMarkup;

  const size = getZoomedMermaidSvgSize(baseSize, zoomPercent);
  const originalStyle = svg.getAttribute("style")?.trim();
  const zoomStyle = `width: ${size.width}px; height: ${size.height}px; max-width: none;`;
  svg.setAttribute(
    "style",
    originalStyle ? `${originalStyle}; ${zoomStyle}` : zoomStyle,
  );
  svg.setAttribute("focusable", "false");
  return new XMLSerializer().serializeToString(svg);
}

export function getNextMermaidZoomPercent(
  current: number,
  direction: -1 | 1,
) {
  return clamp(
    current + direction * mermaidZoomStepPercent,
    minimumMermaidZoomPercent,
    maximumMermaidZoomPercent,
  );
}

export function captureScrollViewportCenter(
  metrics: ScrollViewportMetrics,
): ScrollViewportCenter {
  return {
    x:
      metrics.scrollWidth > metrics.clientWidth
        ? clamp(
            (metrics.scrollLeft + metrics.clientWidth / 2) /
              metrics.scrollWidth,
            0,
            1,
          )
        : 0.5,
    y:
      metrics.scrollHeight > metrics.clientHeight
        ? clamp(
            (metrics.scrollTop + metrics.clientHeight / 2) /
              metrics.scrollHeight,
            0,
            1,
          )
        : 0.5,
  };
}

export function getScrollOffsetsForViewportCenter(
  center: ScrollViewportCenter,
  metrics: ScrollViewportMetrics,
) {
  return {
    left: clamp(
      center.x * metrics.scrollWidth - metrics.clientWidth / 2,
      0,
      Math.max(0, metrics.scrollWidth - metrics.clientWidth),
    ),
    top: clamp(
      center.y * metrics.scrollHeight - metrics.clientHeight / 2,
      0,
      Math.max(0, metrics.scrollHeight - metrics.clientHeight),
    ),
  };
}

type FitMermaidZoomOptions = {
  baseWidth: number;
  viewportWidth: number;
  paddingLeft: number;
  paddingRight: number;
};

type ContainMermaidZoomOptions = {
  baseWidth: number;
  baseHeight: number;
  viewportWidth: number;
  viewportHeight: number;
  paddingLeft: number;
  paddingRight: number;
  paddingTop: number;
  paddingBottom: number;
};

export function calculateFitMermaidZoomPercent({
  baseWidth,
  viewportWidth,
  paddingLeft,
  paddingRight,
}: FitMermaidZoomOptions): number | null {
  if (
    !Number.isFinite(baseWidth) ||
    !Number.isFinite(viewportWidth) ||
    baseWidth <= 0 ||
    viewportWidth <= 0
  ) {
    return null;
  }

  const horizontalPadding =
    Math.max(0, Number.isFinite(paddingLeft) ? paddingLeft : 0) +
    Math.max(0, Number.isFinite(paddingRight) ? paddingRight : 0);
  const availableWidth = viewportWidth - horizontalPadding;

  if (availableWidth <= 0) {
    return minimumMermaidZoomPercent;
  }

  let zoomPercent = clamp(
    Math.floor((availableWidth / baseWidth) * 100),
    minimumMermaidZoomPercent,
    100,
  );

  while (
    zoomPercent > minimumMermaidZoomPercent &&
    Math.ceil((baseWidth * zoomPercent) / 100) + horizontalPadding >
      viewportWidth
  ) {
    zoomPercent -= 1;
  }

  return zoomPercent;
}

export function calculateContainMermaidZoomPercent({
  baseWidth,
  baseHeight,
  viewportWidth,
  viewportHeight,
  paddingLeft,
  paddingRight,
  paddingTop,
  paddingBottom,
}: ContainMermaidZoomOptions): number | null {
  if (
    !Number.isFinite(baseWidth) ||
    !Number.isFinite(baseHeight) ||
    !Number.isFinite(viewportWidth) ||
    !Number.isFinite(viewportHeight) ||
    baseWidth <= 0 ||
    baseHeight <= 0 ||
    viewportWidth <= 0 ||
    viewportHeight <= 0
  ) {
    return null;
  }

  const horizontalPadding =
    Math.max(0, Number.isFinite(paddingLeft) ? paddingLeft : 0) +
    Math.max(0, Number.isFinite(paddingRight) ? paddingRight : 0);
  const verticalPadding =
    Math.max(0, Number.isFinite(paddingTop) ? paddingTop : 0) +
    Math.max(0, Number.isFinite(paddingBottom) ? paddingBottom : 0);
  const availableWidth = viewportWidth - horizontalPadding;
  const availableHeight = viewportHeight - verticalPadding;

  if (availableWidth <= 0 || availableHeight <= 0) {
    return minimumMermaidZoomPercent;
  }

  let zoomPercent = clamp(
    Math.floor(
      Math.min(availableWidth / baseWidth, availableHeight / baseHeight) * 100,
    ),
    minimumMermaidZoomPercent,
    100,
  );

  while (
    zoomPercent > minimumMermaidZoomPercent &&
    (Math.ceil((baseWidth * zoomPercent) / 100) + horizontalPadding >
      viewportWidth ||
      Math.ceil((baseHeight * zoomPercent) / 100) + verticalPadding >
        viewportHeight)
  ) {
    zoomPercent -= 1;
  }

  return zoomPercent;
}
