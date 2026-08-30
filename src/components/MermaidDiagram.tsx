import {
  memo,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import type { MermaidThemeTokens } from "../lib/mermaid-renderer";
import type { MermaidCurvePreference } from "../lib/mermaid-curve";
import {
  calculateFitMermaidZoomPercent,
  captureScrollViewportCenter,
  getNextMermaidZoomPercent,
  getScrollOffsetsForViewportCenter,
  getZoomedMermaidSvgSize,
  parseMermaidSvgViewBox,
  type ScrollViewportCenter,
} from "../lib/mermaid-zoom";
import { notifyPreviewLayoutChange } from "../lib/preview-layout-events";
import {
  capturePreviewScrollAnchor,
  restorePreviewScrollAnchor,
  type PreviewScrollAnchorSnapshot,
} from "../lib/preview-scroll-anchor";
import { MermaidZoomControls } from "./MermaidZoomControls";

type MermaidDiagramProps = {
  source: string;
  sourceOffset?: string | number;
  appearanceKey: string;
  curve: MermaidCurvePreference;
};

type MermaidDiagramState = {
  svg: string | null;
  accessibleTitle: string | null;
  error: boolean;
  isLoading: boolean;
  revision: number;
  renderedSource: string | null;
  renderedAppearanceKey: string | null;
  renderedCurve: MermaidCurvePreference | null;
};

const fallbackTheme: MermaidThemeTokens = {
  background: "#fffefb",
  surface: "#fffefb",
  surfaceMuted: "#f1eee7",
  text: "#302f2b",
  textStrong: "#25241f",
  border: "#ddd9cf",
  accent: "#4e7e6e",
  accentSoft: "#76a392",
  fontFamily: "sans-serif",
  fontSize: "17px",
  darkMode: false,
};

function readToken(style: CSSStyleDeclaration, name: string, fallback: string) {
  return style.getPropertyValue(name).trim() || fallback;
}

export function readMermaidThemeTokens(element: HTMLElement) {
  const shell = element.closest<HTMLElement>(".app-shell") ?? element;
  const style = window.getComputedStyle(shell);

  return {
    background: readToken(
      style,
      "--preview-background",
      fallbackTheme.background,
    ),
    surface: readToken(
      style,
      "--control-background",
      fallbackTheme.surface,
    ),
    surfaceMuted: readToken(
      style,
      "--inline-code-background",
      fallbackTheme.surfaceMuted,
    ),
    text: readToken(style, "--text-body", fallbackTheme.text),
    textStrong: readToken(
      style,
      "--text-heading",
      fallbackTheme.textStrong,
    ),
    border: readToken(style, "--border", fallbackTheme.border),
    accent: readToken(style, "--accent", fallbackTheme.accent),
    accentSoft: readToken(
      style,
      "--accent-soft",
      fallbackTheme.accentSoft,
    ),
    fontFamily: readToken(
      style,
      "--reading-font",
      fallbackTheme.fontFamily,
    ),
    fontSize: readToken(
      style,
      "--reading-font-size",
      fallbackTheme.fontSize,
    ),
    darkMode: style.colorScheme.split(/\s+/u).includes("dark"),
  } satisfies MermaidThemeTokens;
}

function applySvgSize(container: HTMLElement, zoomPercent: number) {
  const svg = container.querySelector<SVGSVGElement>("svg");
  const baseSize = parseMermaidSvgViewBox(svg?.getAttribute("viewBox"));
  if (!svg || !baseSize) return;

  const size = getZoomedMermaidSvgSize(baseSize, zoomPercent);
  svg.style.width = `${size.width}px`;
  svg.style.height = `${size.height}px`;
  svg.style.maxWidth = "none";
  svg.setAttribute("focusable", "false");
}

function readViewportMetrics(element: HTMLElement) {
  return {
    scrollLeft: element.scrollLeft,
    scrollTop: element.scrollTop,
    scrollWidth: element.scrollWidth,
    scrollHeight: element.scrollHeight,
    clientWidth: element.clientWidth,
    clientHeight: element.clientHeight,
  };
}

function getMermaidAccessibleTitle(svg: string) {
  const document = new DOMParser().parseFromString(svg, "image/svg+xml");
  return document.querySelector("svg > title")?.textContent?.trim() || null;
}

export const MermaidDiagram = memo(function MermaidDiagram({
  source,
  sourceOffset,
  appearanceKey,
  curve,
}: MermaidDiagramProps) {
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLDivElement | null>(null);
  const pendingCenterRef = useRef<ScrollViewportCenter | null>(null);
  const pendingOuterAnchorRef =
    useRef<PreviewScrollAnchorSnapshot | null>(null);
  const zoomPercentRef = useRef(100);
  const [zoomPercent, setZoomPercent] = useState(100);
  zoomPercentRef.current = zoomPercent;
  const [state, setState] = useState<MermaidDiagramState>({
    svg: null,
    accessibleTitle: null,
    error: false,
    isLoading: true,
    revision: 0,
    renderedSource: null,
    renderedAppearanceKey: null,
    renderedCurve: null,
  });

  useEffect(() => {
    const wrapper = wrapperRef.current;
    if (!wrapper) return;

    const controller = new AbortController();
    setState((current) => ({
      ...current,
      error: current.svg ? current.error : false,
      isLoading: true,
    }));

    void document.fonts.ready
      .catch(() => undefined)
      .then(() => import("../lib/mermaid-renderer"))
      .then(({ renderMermaidDiagram }) =>
        renderMermaidDiagram({
          source,
          theme: readMermaidThemeTokens(wrapper),
          curve,
          signal: controller.signal,
        }),
      )
      .then((svg) => {
        if (controller.signal.aborted) return;
        if (wrapper.querySelector(".mermaid-diagram-canvas svg")) {
          pendingOuterAnchorRef.current = capturePreviewScrollAnchor(wrapper);
          pendingCenterRef.current = captureScrollViewportCenter(
            readViewportMetrics(wrapper),
          );
        }
        setState((current) => ({
          svg,
          accessibleTitle: getMermaidAccessibleTitle(svg),
          error: false,
          isLoading: false,
          revision: current.revision + 1,
          renderedSource: source,
          renderedAppearanceKey: appearanceKey,
          renderedCurve: curve,
        }));
      })
      .catch((error: unknown) => {
        if (
          controller.signal.aborted ||
          (error instanceof DOMException && error.name === "AbortError")
        ) {
          return;
        }
        setState((current) => ({
          svg: null,
          accessibleTitle: null,
          error: true,
          isLoading: false,
          revision: current.revision + 1,
          renderedSource: source,
          renderedAppearanceKey: appearanceKey,
          renderedCurve: curve,
        }));
      });

    return () => controller.abort();
  }, [appearanceKey, curve, source]);

  useLayoutEffect(() => {
    const wrapper = wrapperRef.current;
    const canvas = canvasRef.current;
    if (canvas) applySvgSize(canvas, zoomPercent);

    const pendingCenter = pendingCenterRef.current;
    if (wrapper && pendingCenter) {
      const offsets = getScrollOffsetsForViewportCenter(
        pendingCenter,
        readViewportMetrics(wrapper),
      );
      wrapper.scrollTop = offsets.top;
      wrapper.scrollLeft = offsets.left;
      pendingCenterRef.current = null;
    }

    const pendingOuterAnchor = pendingOuterAnchorRef.current;
    if (pendingOuterAnchor) {
      restorePreviewScrollAnchor(pendingOuterAnchor);
      pendingOuterAnchorRef.current = null;
    }

    if (wrapper && canvas) notifyPreviewLayoutChange(wrapper);
  }, [state.revision, zoomPercent]);

  const commitZoom = useCallback((nextZoomPercent: number) => {
    const wrapper = wrapperRef.current;
    if (!wrapper || zoomPercentRef.current === nextZoomPercent) return;

    pendingCenterRef.current = captureScrollViewportCenter(
      readViewportMetrics(wrapper),
    );
    zoomPercentRef.current = nextZoomPercent;
    setZoomPercent(nextZoomPercent);
  }, []);

  const handleZoomOut = useCallback(() => {
    commitZoom(getNextMermaidZoomPercent(zoomPercent, -1));
  }, [commitZoom, zoomPercent]);

  const handleReset = useCallback(() => commitZoom(100), [commitZoom]);

  const handleZoomIn = useCallback(() => {
    commitZoom(getNextMermaidZoomPercent(zoomPercent, 1));
  }, [commitZoom, zoomPercent]);

  const handleFitWidth = useCallback(() => {
    const wrapper = wrapperRef.current;
    const canvas = canvasRef.current;
    const svg = canvas?.querySelector<SVGSVGElement>("svg");
    const baseSize = parseMermaidSvgViewBox(svg?.getAttribute("viewBox"));
    if (!wrapper || !canvas || !baseSize) return;

    const style = window.getComputedStyle(canvas);
    const fitPercent = calculateFitMermaidZoomPercent({
      baseWidth: baseSize.width,
      viewportWidth: wrapper.clientWidth,
      paddingLeft: Number.parseFloat(style.paddingLeft),
      paddingRight: Number.parseFloat(style.paddingRight),
    });
    if (fitPercent !== null) commitZoom(fitPercent);
  }, [commitZoom]);

  const hasVisibleSvg = state.svg !== null && !state.error;
  const isRenderingCurrentDiagram =
    !state.isLoading &&
    state.renderedSource === source &&
    state.renderedAppearanceKey === appearanceKey &&
    state.renderedCurve === curve;
  const isBusy = !isRenderingCurrentDiagram;
  const statusMessage = state.error
    ? "다이어그램을 표시하지 못했습니다. 아래 Mermaid 문법을 확인하세요."
    : !hasVisibleSvg && state.isLoading
      ? "다이어그램 불러오는 중…"
      : "";
  const statusClassName = state.error
    ? "mermaid-diagram-status is-error"
    : statusMessage
      ? "mermaid-diagram-status is-loading"
      : "mermaid-diagram-status mermaid-diagram-visually-hidden";
  const accessibleName = state.accessibleTitle
    ? `Mermaid 다이어그램: ${state.accessibleTitle}`
    : "Mermaid 다이어그램";

  return (
    <div
      className={`mermaid-diagram${hasVisibleSvg ? " is-ready" : ""}`}
      data-source-offset={sourceOffset}
    >
      {hasVisibleSvg ? (
        <MermaidZoomControls
          zoomPercent={zoomPercent}
          disabled={isBusy}
          onZoomOut={handleZoomOut}
          onReset={handleReset}
          onZoomIn={handleZoomIn}
          onFitWidth={handleFitWidth}
        />
      ) : null}
      <div
        ref={wrapperRef}
        className="mermaid-diagram-scroll"
        role="region"
        aria-label={accessibleName}
        aria-busy={isBusy}
        tabIndex={0}
      >
        <p
          className={statusClassName}
          role="status"
          aria-live="polite"
          aria-atomic="true"
          data-preview-search-ignore="true"
        >
          {statusMessage}
        </p>
        {hasVisibleSvg ? (
          <div
            ref={canvasRef}
            className="mermaid-diagram-canvas"
            dangerouslySetInnerHTML={{ __html: state.svg ?? "" }}
          />
        ) : state.error ? (
          <div className="mermaid-diagram-error">
            <pre className="mermaid-diagram-source" translate="no">
              <code className="language-mermaid">{source}</code>
            </pre>
          </div>
        ) : null}
      </div>
    </div>
  );
});
