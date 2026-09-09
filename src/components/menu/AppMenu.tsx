import { useLayoutEffect, useRef, type CSSProperties } from "react";
import { createRoot } from "react-dom/client";
import "./AppMenu.css";

export type AppMenuItem = { id: string; label: string; icon?: string; shortcut?: string;
  enabled?: boolean; key?: string; shift?: boolean; action: () => void } | { separator: true };
export type AppMenuOptions = { label: string; items: AppMenuItem[]; x: number; y: number;
  target: HTMLElement; isValid?: () => boolean };
let activeClose: (() => void) | undefined;

export function dismissAppMenu() { activeClose?.(); }

export function showAppMenu(options: AppMenuOptions): Promise<void> {
  dismissAppMenu();
  if (!options.target.isConnected || options.isValid?.() === false) return Promise.resolve();
  const container = document.createElement("div");
  container.className = "app-menu-layer";
  (options.target.closest(".app-shell") ?? document.body).append(container);
  const root = createRoot(container);
  return new Promise((resolve) => {
    let closed = false;
    const close = (restore = false) => {
      if (closed) return;
      closed = true;
      if (activeClose === cancel) activeClose = undefined;
      if (restore && options.target.isConnected) options.target.focus({ preventScroll: true });
      // React event handlers may close the menu; unmount after their dispatch.
      queueMicrotask(() => { root.unmount(); container.remove(); resolve(); });
    };
    const cancel = () => close(false);
    activeClose = cancel;
    root.render(<AppMenu options={options} close={close} />);
  });
}

function AppMenu({ options, close }: { options: AppMenuOptions; close: (restore?: boolean) => void }) {
  const menuRef = useRef<HTMLDivElement>(null);
  const executed = useRef(false);
  useLayoutEffect(() => {
    const menu = menuRef.current;
    if (!menu) return;
    const place = () => {
      const bounds = menu.getBoundingClientRect();
      menu.style.left = `${Math.max(8, Math.min(options.x, window.innerWidth - bounds.width - 8))}px`;
      menu.style.top = `${Math.max(8, Math.min(options.y, window.innerHeight - bounds.height - 8))}px`;
    };
    place();
    const resize = new ResizeObserver(place);
    resize.observe(menu);
    (menu.querySelector<HTMLElement>('[role="menuitem"]:not([disabled])') ?? menu).focus({ preventScroll: true });
    const outside = (event: Event) => { if (event.target instanceof Node && !menu.contains(event.target)) close(); };
    const cancel = () => close();
    const validity = new MutationObserver(() => {
      if (!options.target.isConnected || options.isValid?.() === false) close();
    });
    validity.observe(document.body, { childList: true, subtree: true });
    document.addEventListener("pointerdown", outside, true);
    document.addEventListener("scroll", outside, true);
    document.addEventListener("focusin", outside, true);
    window.addEventListener("resize", cancel);
    window.addEventListener("blur", cancel);
    return () => {
      resize.disconnect(); validity.disconnect();
      document.removeEventListener("pointerdown", outside, true);
      document.removeEventListener("scroll", outside, true);
      document.removeEventListener("focusin", outside, true);
      window.removeEventListener("resize", cancel);
      window.removeEventListener("blur", cancel);
    };
  }, [options, close]);

  function run(item: Exclude<AppMenuItem, { separator: true }>) {
    if (executed.current || item.enabled === false) return;
    executed.current = true;
    const valid = options.target.isConnected && options.isValid?.() !== false;
    close(true);
    if (valid) item.action();
  }

  return <div ref={menuRef} className="app-context-menu" role="menu" tabIndex={-1} aria-label={options.label}
    onContextMenu={(event) => event.preventDefault()}
    onKeyDown={(event) => {
      event.stopPropagation();
      if (event.key === "Escape") { event.preventDefault(); close(true); return; }
      if (event.key === "Tab") { close(true); return; }
      if (event.metaKey && !event.altKey) {
        const command = options.items.find((item) => !("separator" in item) && item.key === event.key.toLowerCase() && !!item.shift === event.shiftKey);
        if (command && !("separator" in command)) { event.preventDefault(); if (!event.repeat) run(command); return; }
      }
      const items = Array.from(menuRef.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]:not([disabled])') ?? []);
      if (!items.length) return;
      const index = items.indexOf(document.activeElement as HTMLButtonElement);
      let next: number | undefined;
      if (event.key === "ArrowDown") next = (index + 1) % items.length;
      if (event.key === "ArrowUp") next = (index - 1 + items.length) % items.length;
      if (event.key === "Home") next = 0;
      if (event.key === "End") next = items.length - 1;
      if (next !== undefined) { event.preventDefault(); items[next].focus(); }
    }}>
    {options.items.map((item, index) => "separator" in item
      ? <div key={`separator-${index}`} role="separator" className="app-context-menu-separator" />
      : <button key={item.id} type="button" role="menuitem" className="app-context-menu-item"
        disabled={item.enabled === false} aria-disabled={item.enabled === false}
        onPointerMove={(event) => event.currentTarget.focus({ preventScroll: true })}
        onClick={() => run(item)}>
        <span className="app-context-menu-icon" aria-hidden="true"
          style={item.icon ? { "--menu-icon": `url("${item.icon}")` } as CSSProperties : undefined} />
        <span className="app-context-menu-label">{item.label}</span>
        <span className="app-context-menu-shortcut" aria-hidden="true">{item.shortcut}</span>
      </button>)}
  </div>;
}
