import {
  useEffect,
  useRef,
  type CSSProperties,
  type KeyboardEvent,
  type PointerEvent,
  type ReactNode,
} from "react";

const minimumSidebarWidth = 220;
const maximumSidebarWidth = 420;
const keyboardResizeStep = 12;

type StageSidebarLayoutProps = {
  sidebar: ReactNode;
  closeLabel: string;
  isSidebarInset: boolean;
  sidebarWidth: number;
  onClose: () => void;
  onSidebarWidthChange: (width: number) => void;
  children: ReactNode;
};

function clampSidebarWidth(width: number) {
  return Math.min(
    maximumSidebarWidth,
    Math.max(minimumSidebarWidth, Math.round(width)),
  );
}

export function StageSidebarLayout({
  sidebar,
  closeLabel,
  isSidebarInset,
  sidebarWidth,
  onClose,
  onSidebarWidthChange,
  children,
}: StageSidebarLayoutProps) {
  const stageRef = useRef<HTMLDivElement>(null);
  const dragWidthRef = useRef(sidebarWidth);
  const isDraggingRef = useRef(false);
  const clampedWidth = clampSidebarWidth(sidebarWidth);

  useEffect(
    () => () => document.body.classList.remove("is-resizing-stage-sidebar"),
    [],
  );

  useEffect(() => {
    if (sidebar && isSidebarInset) return;
    isDraggingRef.current = false;
    document.body.classList.remove("is-resizing-stage-sidebar");
  }, [isSidebarInset, sidebar]);

  function applyTransientWidth(width: number) {
    const nextWidth = clampSidebarWidth(width);
    dragWidthRef.current = nextWidth;
    stageRef.current?.style.setProperty(
      "--stage-sidebar-width",
      `${nextWidth}px`,
    );
  }

  function handleResizePointerDown(event: PointerEvent<HTMLDivElement>) {
    if (event.button !== 0) return;
    isDraggingRef.current = true;
    dragWidthRef.current = clampedWidth;
    event.currentTarget.setPointerCapture?.(event.pointerId);
    document.body.classList.add("is-resizing-stage-sidebar");
  }

  function handleResizePointerMove(event: PointerEvent<HTMLDivElement>) {
    if (!isDraggingRef.current) return;
    applyTransientWidth(event.clientX);
  }

  function finishResize(event: PointerEvent<HTMLDivElement>) {
    if (!isDraggingRef.current) return;
    isDraggingRef.current = false;
    document.body.classList.remove("is-resizing-stage-sidebar");
    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    onSidebarWidthChange(dragWidthRef.current);
  }

  function handleResizeKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    let nextWidth: number | null = null;
    if (event.key === "ArrowLeft") {
      nextWidth = clampedWidth - keyboardResizeStep;
    } else if (event.key === "ArrowRight") {
      nextWidth = clampedWidth + keyboardResizeStep;
    } else if (event.key === "Home") {
      nextWidth = minimumSidebarWidth;
    } else if (event.key === "End") {
      nextWidth = maximumSidebarWidth;
    }
    if (nextWidth === null) return;
    event.preventDefault();
    onSidebarWidthChange(clampSidebarWidth(nextWidth));
  }

  const stageStyle = {
    "--stage-sidebar-width": `${clampedWidth}px`,
  } as CSSProperties;

  return (
    <div
      ref={stageRef}
      className={`document-stage${sidebar ? " has-sidebar" : ""}`}
      style={stageStyle}
    >
      {sidebar}
      {sidebar && isSidebarInset ? (
        <div
          className="stage-sidebar-resizer"
          role="separator"
          aria-label="사이드바 너비 조절"
          aria-orientation="vertical"
          aria-valuemin={minimumSidebarWidth}
          aria-valuemax={maximumSidebarWidth}
          aria-valuenow={clampedWidth}
          tabIndex={0}
          onKeyDown={handleResizeKeyDown}
          onPointerDown={handleResizePointerDown}
          onPointerMove={handleResizePointerMove}
          onPointerUp={finishResize}
          onPointerCancel={finishResize}
          onLostPointerCapture={finishResize}
        />
      ) : null}
      {sidebar ? (
        <button
          type="button"
          className="sidebar-scrim"
          tabIndex={-1}
          aria-label={closeLabel}
          onClick={onClose}
        />
      ) : null}
      {children}
    </div>
  );
}
