import { useEffect, useState } from "react";
import "./transient-scrollbar.css";

const idleDelay = 1_000;
const fadeDuration = 180;
const scrollKeys = new Set([
  "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight",
  "PageUp", "PageDown", "Home", "End", " ",
]);

/** Keep the native scrollbar and its hit area; only its paint is transient. */
export function useTransientScrollbar() {
  const [element, setElement] = useState<HTMLElement | null>(null);
  useEffect(() => {
    if (!element) return;
    let timeout: number | undefined;
    let frame: number | undefined;
    let userScrollUntil = 0;
    let hoveringEdge = false;
    let dragging = false;
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    element.dataset.transientScrollbar = "true";
    const paint = (alpha: number) => {
      element.style.setProperty("--scrollbar-opacity", String(alpha));
    };
    paint(0);
    const cancel = () => {
      window.clearTimeout(timeout);
      if (frame !== undefined) window.cancelAnimationFrame(frame);
      frame = undefined;
    };
    const hide = () => {
      if (dragging || hoveringEdge) return;
      if (reducedMotion.matches) {
        paint(0);
        return;
      }
      const start = performance.now();
      const fade = (now: number) => {
        const alpha = Math.max(0, 1 - (now - start) / fadeDuration);
        paint(alpha);
        frame = alpha > 0 ? window.requestAnimationFrame(fade) : undefined;
      };
      frame = window.requestAnimationFrame(fade);
    };
    const show = () => {
      cancel();
      paint(1);
      timeout = window.setTimeout(hide, idleDelay);
    };
    // Scroll events also come from layout restoration. Input opens a short
    // activity window; only ensuing scroll events extend it (including inertia).
    const input = () => {
      userScrollUntil = performance.now() + idleDelay;
    };
    const scroll = (event: Event) => {
      if (event.target === element &&
          (dragging || performance.now() < userScrollUntil)) {
        input();
        show();
      }
    };
    const keydown = (event: KeyboardEvent) => {
      if (scrollKeys.has(event.key)) input();
    };
    const nearEdge = (event: PointerEvent) => {
      const rect = element.getBoundingClientRect();
      // Includes both overlay and classic scrollbar gutters. No event is
      // prevented: the native thumb/track continues to handle dragging/clicks.
      const vertical = element.scrollHeight > element.clientHeight &&
        event.clientX >= rect.right - 14 && event.clientX <= rect.right;
      const horizontal = element.scrollWidth > element.clientWidth &&
        event.clientY >= rect.bottom - 14 && event.clientY <= rect.bottom;
      return vertical || horizontal;
    };
    const move = (event: PointerEvent) => {
      const next = nearEdge(event);
      if (next) show();
      else if (hoveringEdge) show();
      hoveringEdge = next;
    };
    const leave = () => {
      const wasHovering = hoveringEdge;
      hoveringEdge = false;
      if (wasHovering && !dragging) show();
    };
    const down = (event: PointerEvent) => {
      if (event.button === 0 && nearEdge(event)) {
        dragging = true;
        input();
        show();
      }
    };
    const up = () => {
      if (dragging) {
        dragging = false;
        show();
      }
    };
    const blur = () => {
      hoveringEdge = false;
      dragging = false;
      cancel();
      paint(0);
      userScrollUntil = 0;
    };
    element.addEventListener("wheel", input, { passive: true });
    element.addEventListener("touchmove", input, { passive: true });
    element.addEventListener("keydown", keydown);
    element.addEventListener("scroll", scroll, { passive: true });
    element.addEventListener("pointermove", move);
    element.addEventListener("pointerleave", leave);
    element.addEventListener("pointerdown", down);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
    window.addEventListener("blur", blur);
    return () => {
      cancel();
      element.removeEventListener("wheel", input);
      element.removeEventListener("touchmove", input);
      element.removeEventListener("keydown", keydown);
      element.removeEventListener("scroll", scroll);
      element.removeEventListener("pointermove", move);
      element.removeEventListener("pointerleave", leave);
      element.removeEventListener("pointerdown", down);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
      window.removeEventListener("blur", blur);
      delete element.dataset.transientScrollbar;
      element.style.removeProperty("--scrollbar-opacity");
    };
  }, [element]);
  return setElement;
}
