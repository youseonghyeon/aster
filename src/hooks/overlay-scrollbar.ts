let scrollportSequence = 0;

/** Overlay controls for a native scrolling viewport. The host is an empty,
 * dedicated sibling owned by React; its children belong to this adapter. */
export function attachOverlayScrollbar(viewport: HTMLElement, host: HTMLElement) {
  const originalId = viewport.id;
  if (!originalId) viewport.id = `aster-overlay-scrollport-${++scrollportSequence}`;
  const tracks = (["vertical", "horizontal"] as const).map((axis) => {
    const track = document.createElement("div");
    const thumb = document.createElement("div");
    track.className = `overlay-scrollbar-track is-${axis}`;
    thumb.className = "overlay-scrollbar-thumb";
    track.setAttribute("role", "scrollbar");
    track.setAttribute("aria-orientation", axis);
    track.setAttribute("aria-label", axis === "vertical" ? "파일 목록 세로 스크롤" : "파일 목록 가로 스크롤");
    track.setAttribute("aria-valuemin", "0");
    track.setAttribute("aria-controls", viewport.id);
    track.tabIndex = 0;
    track.append(thumb);
    host.append(track);
    return { axis, track, thumb };
  });
  let frame: number | undefined;
  let drag: { pointerId: number; start: number; scroll: number; ratio: number; track: HTMLElement; vertical: boolean } | null = null;
  const metric = (vertical: boolean) => {
    const visible = vertical ? viewport.clientHeight : viewport.clientWidth;
    const content = vertical ? viewport.scrollHeight : viewport.scrollWidth;
    const position = vertical ? viewport.scrollTop : viewport.scrollLeft;
    // Reserve the corner only when both axes overflow.
    const corner = viewport.scrollHeight > viewport.clientHeight && viewport.scrollWidth > viewport.clientWidth ? 10 : 0;
    const length = Math.max(0, visible - corner);
    const size = Math.min(length, Math.max(24, content ? length * visible / content : length));
    const maximum = Math.max(0, content - visible);
    return { visible, position, length, size, maximum, travel: length - size };
  };
  const setPosition = (vertical: boolean, value: number) => {
    const next = Math.max(0, Math.min(metric(vertical).maximum, value));
    if (vertical) viewport.scrollTop = next;
    else viewport.scrollLeft = next;
    update();
  };
  const update = () => {
    for (const { axis, track, thumb } of tracks) {
      const vertical = axis === "vertical";
      const { length, size, position, maximum, travel } = metric(vertical);
      track.hidden = maximum === 0;
      track.style[vertical ? "height" : "width"] = `${length}px`;
      thumb.style[vertical ? "height" : "width"] = `${size}px`;
      thumb.style.transform = `${vertical ? "translateY" : "translateX"}(${maximum ? Math.max(0, Math.min(maximum, position)) / maximum * travel : 0}px)`;
      track.setAttribute("aria-valuemax", String(Math.round(maximum)));
      track.setAttribute("aria-valuenow", String(Math.round(Math.max(0, Math.min(maximum, position)))));
    }
  };
  const schedule = () => {
    if (frame !== undefined) return;
    frame = window.requestAnimationFrame(() => { frame = undefined; update(); });
  };
  const cancelDrag = () => {
    if (drag?.track.hasPointerCapture?.(drag.pointerId)) drag.track.releasePointerCapture(drag.pointerId);
    drag = null;
  };
  const down = (event: PointerEvent) => {
    if (event.button !== 0) return;
    const entry = tracks.find(({ track }) => track.contains(event.target as Node));
    if (!entry) return;
    const vertical = entry.axis === "vertical";
    const { visible, position, maximum, travel } = metric(vertical);
    event.preventDefault();
    if (event.target === entry.thumb) {
      drag = { pointerId: event.pointerId, start: vertical ? event.clientY : event.clientX, scroll: position,
        ratio: travel ? maximum / travel : 0, track: entry.track, vertical };
      entry.track.setPointerCapture?.(event.pointerId);
    } else {
      const rect = entry.thumb.getBoundingClientRect();
      const before = vertical ? event.clientY < rect.top : event.clientX < rect.left;
      setPosition(vertical, position + (before ? -visible : visible));
    }
  };
  const move = (event: PointerEvent) => {
    if (!drag || event.pointerId !== drag.pointerId) return;
    setPosition(drag.vertical, drag.scroll + ((drag.vertical ? event.clientY : event.clientX) - drag.start) * drag.ratio);
  };
  const up = (event: PointerEvent) => { if (event.pointerId === drag?.pointerId) cancelDrag(); };
  const keydown = (event: KeyboardEvent) => {
    const entry = tracks.find(({ track }) => track === event.target);
    if (!entry) return;
    const vertical = entry.axis === "vertical";
    const { position, visible, maximum } = metric(vertical);
    let next: number;
    switch (event.key) {
      case "ArrowUp": if (!vertical) return; next = position - 40; break;
      case "ArrowDown": if (!vertical) return; next = position + 40; break;
      case "ArrowLeft": if (vertical) return; next = position - 40; break;
      case "ArrowRight": if (vertical) return; next = position + 40; break;
      case "PageUp": next = position - visible; break;
      case "PageDown": next = position + visible; break;
      case " ": next = position + (event.shiftKey ? -visible : visible); break;
      case "Home": next = 0; break;
      case "End": next = maximum; break;
      default: return;
    }
    event.preventDefault();
    setPosition(vertical, next);
  };
  const wheel = (event: WheelEvent) => {
    if (event.ctrlKey) return; // Preserve pinch/zoom gestures.
    // The overlay is a sibling, so route wheel input on its visible track to
    // the viewport rather than letting it scroll an unrelated outer panel.
    const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? viewport.clientHeight : 1;
    const x = event.shiftKey && event.deltaX === 0 ? event.deltaY : event.deltaX;
    const y = event.shiftKey && event.deltaX === 0 ? 0 : event.deltaY;
    if ((x && viewport.scrollWidth > viewport.clientWidth) || (y && viewport.scrollHeight > viewport.clientHeight)) {
      event.preventDefault();
      setPosition(false, viewport.scrollLeft + x * unit);
      setPosition(true, viewport.scrollTop + y * unit);
    }
  };
  const observer = new ResizeObserver(schedule);
  const observeContent = () => {
    observer.disconnect();
    observer.observe(viewport);
    for (const child of viewport.children) observer.observe(child);
  };
  const mutations = new MutationObserver(() => { observeContent(); schedule(); });
  mutations.observe(viewport, { childList: true, subtree: true, characterData: true });
  observeContent();
  viewport.addEventListener("scroll", update, { passive: true });
  host.addEventListener("pointerdown", down);
  host.addEventListener("keydown", keydown);
  host.addEventListener("wheel", wheel, { passive: false });
  window.addEventListener("pointermove", move);
  window.addEventListener("pointerup", up);
  window.addEventListener("pointercancel", up);
  window.addEventListener("blur", cancelDrag);
  update();
  return () => {
    cancelDrag();
    if (frame !== undefined) window.cancelAnimationFrame(frame);
    observer.disconnect();
    mutations.disconnect();
    viewport.removeEventListener("scroll", update);
    host.removeEventListener("pointerdown", down);
    host.removeEventListener("keydown", keydown);
    host.removeEventListener("wheel", wheel);
    window.removeEventListener("pointermove", move);
    window.removeEventListener("pointerup", up);
    window.removeEventListener("pointercancel", up);
    window.removeEventListener("blur", cancelDrag);
    host.replaceChildren();
    if (!originalId) viewport.removeAttribute("id");
  };
}
