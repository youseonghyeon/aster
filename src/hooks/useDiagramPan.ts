import { useEffect, useRef, type PointerEvent, type RefObject } from "react";

/** Pan without React renders: keep SVG identity and native scroll offsets intact. */
export function useDiagramPan(scrollRef: RefObject<HTMLDivElement | null>, resetKey: string) {
  const origin = useRef<{
    id: number; x: number; y: number; left: number; top: number; moved: boolean; target: HTMLDivElement;
  } | null>(null);
  const suppressClick = useRef(false);
  useEffect(() => {
    function cancel() {
      const drag = origin.current;
      origin.current = null;
      if (!drag) return;
      suppressClick.current = true;
      drag.target.classList.remove("is-dragging");
      if (drag.target.hasPointerCapture?.(drag.id)) drag.target.releasePointerCapture(drag.id);
    }
    window.addEventListener("blur", cancel);
    return () => { window.removeEventListener("blur", cancel); cancel(); };
  }, [resetKey]);
  function finish(event: PointerEvent<HTMLDivElement>) {
    const drag = origin.current;
    if (!drag || drag.id !== event.pointerId) return;
    if (drag.moved || event.type === "pointercancel") suppressClick.current = true;
    origin.current = null;
    event.currentTarget.classList.remove("is-dragging");
    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }
  return {
    consumeClick() {
      const suppressed = suppressClick.current;
      suppressClick.current = false;
      return suppressed;
    },
    handlers: {
      onPointerDown(event: PointerEvent<HTMLDivElement>) {
        suppressClick.current = false;
        const scroll = scrollRef.current;
        if (!scroll || event.button !== 0 || event.isPrimary === false ||
          (scroll.scrollWidth <= scroll.clientWidth && scroll.scrollHeight <= scroll.clientHeight)) return;
        origin.current = { id: event.pointerId, x: event.clientX, y: event.clientY,
          left: scroll.scrollLeft, top: scroll.scrollTop, moved: false, target: event.currentTarget };
      },
      onPointerMove(event: PointerEvent<HTMLDivElement>) {
        const scroll = scrollRef.current;
        const drag = origin.current;
        if (!scroll || !drag || drag.id !== event.pointerId) return;
        const dx = event.clientX - drag.x;
        const dy = event.clientY - drag.y;
        if (!drag.moved && Math.hypot(dx, dy) < 5) return;
        if (!drag.moved) {
          drag.moved = true;
          suppressClick.current = true;
          event.currentTarget.setPointerCapture?.(event.pointerId);
          event.currentTarget.classList.add("is-dragging");
        }
        event.preventDefault();
        scroll.scrollLeft = Math.max(0, Math.min(scroll.scrollWidth - scroll.clientWidth, drag.left - dx));
        scroll.scrollTop = Math.max(0, Math.min(scroll.scrollHeight - scroll.clientHeight, drag.top - dy));
      },
      onPointerUp: finish,
      onPointerCancel: finish,
      onLostPointerCapture: finish,
      onPointerLeave(event: PointerEvent<HTMLDivElement>) {
        if (origin.current && !origin.current.moved) finish(event);
      },
      onDragStart(event: React.DragEvent<HTMLDivElement>) { event.preventDefault(); },
    },
  };
}
