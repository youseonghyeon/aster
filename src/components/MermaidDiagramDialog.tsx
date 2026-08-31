import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type MouseEvent,
  type PointerEvent,
} from "react";
import {
  calculateContainMermaidZoomPercent,
  calculateFitMermaidZoomPercent,
  captureScrollViewportCenter,
  getNextMermaidZoomPercent,
  getScrollOffsetsForViewportCenter,
  getZoomedMermaidSvgMarkup,
  parseMermaidSvgViewBox,
  type ScrollViewportCenter,
} from "../lib/mermaid-zoom";
import { useBlockingModal } from "../shared/blocking-modal";
import { MermaidZoomControls } from "./MermaidZoomControls";

type MermaidDiagramDialogProps = {
  svg: string;
  accessibleTitle: string | null;
  onClose: () => void;
};

type DiagramDragOrigin = {
  pointerId: number;
  clientX: number;
  clientY: number;
  scrollLeft: number;
  scrollTop: number;
};

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

function readCanvasPadding(canvas: HTMLElement) {
  const style = window.getComputedStyle(canvas);
  return {
    paddingLeft: Number.parseFloat(style.paddingLeft),
    paddingRight: Number.parseFloat(style.paddingRight),
    paddingTop: Number.parseFloat(style.paddingTop),
    paddingBottom: Number.parseFloat(style.paddingBottom),
  };
}

function CloseIcon() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true">
      <path d="M5 5l10 10M15 5L5 15" />
    </svg>
  );
}

export function MermaidDiagramDialog({
  svg,
  accessibleTitle,
  onClose,
}: MermaidDiagramDialogProps) {
  const blockingModal = useBlockingModal();
  const dialogRef = useRef<HTMLDialogElement | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLDivElement | null>(null);
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);
  const pendingCenterRef = useRef<ScrollViewportCenter | null>(null);
  const dragOriginRef = useRef<DiagramDragOrigin | null>(null);
  const zoomPercentRef = useRef(100);
  const [zoomPercent, setZoomPercent] = useState(100);
  zoomPercentRef.current = zoomPercent;
  const zoomedSvg = useMemo(
    () => getZoomedMermaidSvgMarkup(svg, zoomPercent),
    [svg, zoomPercent],
  );

  useLayoutEffect(() => {
    const dialog = dialogRef.current;
    const scroll = scrollRef.current;
    const canvas = canvasRef.current;
    if (!dialog || !scroll || !canvas) return;

    const unregister = blockingModal.register();
    if (!dialog.open) dialog.showModal();

    const renderedSvg = canvas.querySelector<SVGSVGElement>("svg");
    const baseSize = parseMermaidSvgViewBox(
      renderedSvg?.getAttribute("viewBox"),
    );
    if (baseSize) {
      const padding = readCanvasPadding(canvas);
      const fitPercent = calculateContainMermaidZoomPercent({
        baseWidth: baseSize.width,
        baseHeight: baseSize.height,
        viewportWidth: scroll.clientWidth,
        viewportHeight: scroll.clientHeight,
        ...padding,
      });
      if (fitPercent !== null) {
        zoomPercentRef.current = fitPercent;
        setZoomPercent(fitPercent);
      }
    }
    closeButtonRef.current?.focus({ preventScroll: true });

    return () => {
      unregister();
      if (dialog.open) dialog.close();
    };
  }, [blockingModal]);

  useLayoutEffect(() => {
    const scroll = scrollRef.current;
    if (!scroll) return;

    const pendingCenter = pendingCenterRef.current;
    if (pendingCenter) {
      const offsets = getScrollOffsetsForViewportCenter(
        pendingCenter,
        readViewportMetrics(scroll),
      );
      scroll.scrollLeft = offsets.left;
      scroll.scrollTop = offsets.top;
      pendingCenterRef.current = null;
    }
  }, [svg, zoomPercent]);

  const commitZoom = useCallback((nextZoomPercent: number) => {
    const scroll = scrollRef.current;
    if (!scroll || zoomPercentRef.current === nextZoomPercent) return;

    pendingCenterRef.current = captureScrollViewportCenter(
      readViewportMetrics(scroll),
    );
    zoomPercentRef.current = nextZoomPercent;
    setZoomPercent(nextZoomPercent);
  }, []);

  const handleFitWidth = useCallback(() => {
    const scroll = scrollRef.current;
    const canvas = canvasRef.current;
    const renderedSvg = canvas?.querySelector<SVGSVGElement>("svg");
    const baseSize = parseMermaidSvgViewBox(
      renderedSvg?.getAttribute("viewBox"),
    );
    if (!scroll || !canvas || !baseSize) return;

    const padding = readCanvasPadding(canvas);
    const fitPercent = calculateFitMermaidZoomPercent({
      baseWidth: baseSize.width,
      viewportWidth: scroll.clientWidth,
      paddingLeft: padding.paddingLeft,
      paddingRight: padding.paddingRight,
    });
    if (fitPercent !== null) commitZoom(fitPercent);
  }, [commitZoom]);
  const handleZoomOut = useCallback(
    () => commitZoom(getNextMermaidZoomPercent(zoomPercent, -1)),
    [commitZoom, zoomPercent],
  );
  const handleReset = useCallback(() => commitZoom(100), [commitZoom]);
  const handleZoomIn = useCallback(
    () => commitZoom(getNextMermaidZoomPercent(zoomPercent, 1)),
    [commitZoom, zoomPercent],
  );
  useEffect(() => {
    const scroll = scrollRef.current;
    if (!scroll) return;

    const handleWheel = (event: WheelEvent) => {
      if (!event.metaKey || event.deltaY === 0) return;

      event.preventDefault();
      event.stopPropagation();
      commitZoom(
        getNextMermaidZoomPercent(
          zoomPercentRef.current,
          event.deltaY < 0 ? 1 : -1,
        ),
      );
    };
    scroll.addEventListener("wheel", handleWheel, { passive: false });
    return () => scroll.removeEventListener("wheel", handleWheel);
  }, [commitZoom]);

  const handlePointerDown = useCallback(
    (event: PointerEvent<HTMLDivElement>) => {
      const scroll = scrollRef.current;
      if (
        !scroll ||
        event.button !== 0 ||
        event.isPrimary === false ||
        (scroll.scrollWidth <= scroll.clientWidth &&
          scroll.scrollHeight <= scroll.clientHeight)
      ) {
        return;
      }

      event.preventDefault();
      dragOriginRef.current = {
        pointerId: event.pointerId,
        clientX: event.clientX,
        clientY: event.clientY,
        scrollLeft: scroll.scrollLeft,
        scrollTop: scroll.scrollTop,
      };
      event.currentTarget.setPointerCapture?.(event.pointerId);
      event.currentTarget.classList.add("is-dragging");
    },
    [],
  );

  const handlePointerMove = useCallback(
    (event: PointerEvent<HTMLDivElement>) => {
      const scroll = scrollRef.current;
      const origin = dragOriginRef.current;
      if (!scroll || !origin || origin.pointerId !== event.pointerId) return;

      event.preventDefault();
      scroll.scrollLeft = origin.scrollLeft - (event.clientX - origin.clientX);
      scroll.scrollTop = origin.scrollTop - (event.clientY - origin.clientY);
    },
    [],
  );

  const finishPointerDrag = useCallback(
    (event: PointerEvent<HTMLDivElement>) => {
      const origin = dragOriginRef.current;
      if (!origin || origin.pointerId !== event.pointerId) return;

      dragOriginRef.current = null;
      event.currentTarget.classList.remove("is-dragging");
      if (event.currentTarget.hasPointerCapture?.(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
    },
    [],
  );

  function handleDialogClick(event: MouseEvent<HTMLDialogElement>) {
    if (event.target === event.currentTarget) onClose();
  }

  function handleDialogKeyDown(event: KeyboardEvent<HTMLDialogElement>) {
    event.stopPropagation();
    if (event.key === "Escape") {
      event.preventDefault();
      onClose();
      return;
    }
    const isBlockedAppShortcut =
      (event.metaKey || event.ctrlKey) &&
      ["f", "m", "o", "s", "=", "-", "0"].includes(
        event.key.toLowerCase(),
      );
    if (isBlockedAppShortcut) event.preventDefault();
  }

  const title = accessibleTitle || "Mermaid 다이어그램";

  return (
    <dialog
      ref={dialogRef}
      className="mermaid-diagram-dialog"
      aria-labelledby="mermaid-diagram-dialog-title"
      aria-modal="true"
      data-preview-search-ignore="true"
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClick={handleDialogClick}
      onKeyDown={handleDialogKeyDown}
    >
      <div className="mermaid-diagram-dialog-panel">
        <header className="mermaid-diagram-dialog-header">
          <h2 id="mermaid-diagram-dialog-title" title={title}>
            {title}
          </h2>
          <MermaidZoomControls
            zoomPercent={zoomPercent}
            disabled={false}
            onZoomOut={handleZoomOut}
            onReset={handleReset}
            onZoomIn={handleZoomIn}
            onFitWidth={handleFitWidth}
          />
          <button
            ref={closeButtonRef}
            type="button"
            className="mermaid-diagram-dialog-close"
            aria-label="다이어그램 큰 보기 닫기"
            title="다이어그램 큰 보기 닫기 (Escape)"
            onClick={onClose}
          >
            <CloseIcon />
          </button>
        </header>
        <div
          ref={scrollRef}
          className="mermaid-diagram-dialog-scroll"
          role="region"
          aria-label={`큰 보기: ${title}`}
          tabIndex={0}
        >
          <div
            ref={canvasRef}
            className="mermaid-diagram-dialog-canvas"
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={finishPointerDrag}
            onPointerCancel={finishPointerDrag}
            onLostPointerCapture={finishPointerDrag}
            onDragStart={(event) => event.preventDefault()}
            dangerouslySetInnerHTML={{ __html: zoomedSvg }}
          />
        </div>
      </div>
    </dialog>
  );
}
