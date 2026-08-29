import {
  memo,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import type { MermaidThemeTokens } from "../lib/mermaid-renderer";

type MermaidDiagramProps = {
  source: string;
  sourceOffset?: string | number;
  appearanceKey: string;
};

type MermaidDiagramState = {
  svg: string | null;
  accessibleTitle: string | null;
  error: boolean;
  isLoading: boolean;
  revision: number;
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

function normalizeSvgSize(container: HTMLElement) {
  const svg = container.querySelector<SVGSVGElement>("svg");
  const viewBox = svg
    ?.getAttribute("viewBox")
    ?.trim()
    .split(/[\s,]+/u)
    .map(Number);

  if (
    !svg ||
    viewBox?.length !== 4 ||
    !Number.isFinite(viewBox[2]) ||
    !Number.isFinite(viewBox[3]) ||
    viewBox[2] <= 0 ||
    viewBox[3] <= 0
  ) {
    return;
  }

  svg.style.width = `${Math.ceil(viewBox[2])}px`;
  svg.style.height = `${Math.ceil(viewBox[3])}px`;
  svg.style.maxWidth = "none";
  svg.setAttribute("focusable", "false");
}

function getMermaidAccessibleTitle(svg: string) {
  const document = new DOMParser().parseFromString(svg, "image/svg+xml");
  return document.querySelector("svg > title")?.textContent?.trim() || null;
}

export const MermaidDiagram = memo(function MermaidDiagram({
  source,
  sourceOffset,
  appearanceKey,
}: MermaidDiagramProps) {
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLDivElement | null>(null);
  const pendingScrollRef = useRef<{ top: number; left: number } | null>(null);
  const [state, setState] = useState<MermaidDiagramState>({
    svg: null,
    accessibleTitle: null,
    error: false,
    isLoading: true,
    revision: 0,
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
          signal: controller.signal,
        }),
      )
      .then((svg) => {
        if (controller.signal.aborted) return;
        pendingScrollRef.current = {
          top: wrapper.scrollTop,
          left: wrapper.scrollLeft,
        };
        setState((current) => ({
          svg,
          accessibleTitle: getMermaidAccessibleTitle(svg),
          error: false,
          isLoading: false,
          revision: current.revision + 1,
        }));
      })
      .catch((error: unknown) => {
        if (
          controller.signal.aborted ||
          (error instanceof DOMException && error.name === "AbortError")
        ) {
          return;
        }
        pendingScrollRef.current = {
          top: wrapper.scrollTop,
          left: wrapper.scrollLeft,
        };
        setState((current) => ({
          svg: null,
          accessibleTitle: null,
          error: true,
          isLoading: false,
          revision: current.revision + 1,
        }));
      });

    return () => controller.abort();
  }, [appearanceKey, source]);

  useLayoutEffect(() => {
    const wrapper = wrapperRef.current;
    const canvas = canvasRef.current;
    if (canvas) normalizeSvgSize(canvas);

    const pendingScroll = pendingScrollRef.current;
    if (wrapper && pendingScroll) {
      wrapper.scrollTop = pendingScroll.top;
      wrapper.scrollLeft = pendingScroll.left;
      pendingScrollRef.current = null;
    }
  }, [state.revision]);

  const hasVisibleSvg = state.svg !== null && !state.error;
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
      ref={wrapperRef}
      className="mermaid-diagram-scroll"
      role="region"
      aria-label={accessibleName}
      aria-busy={state.isLoading}
      tabIndex={0}
      data-source-offset={sourceOffset}
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
  );
});
