import {
  useEffect,
  useRef,
  type KeyboardEvent,
  type KeyboardEventHandler,
  type PointerEventHandler,
  type Ref,
} from "react";

export type PaneDividerProps = {
  dividerRef: Ref<HTMLDivElement>;
  isPreviewFocusMode: boolean;
  isMenuOpen: boolean;
  isScrollSyncEnabled: boolean;
  isScrollSyncAvailable: boolean;
  isStacked: boolean;
  onMenuOpen: () => void;
  onMenuClose: () => void;
  onScrollSyncToggle: () => void;
  onSwapPanes: () => void;
  onResetSplit: () => void;
  onKeyDown: KeyboardEventHandler<HTMLDivElement>;
  onPointerDown: PointerEventHandler<HTMLDivElement>;
  onPointerMove: PointerEventHandler<HTMLDivElement>;
  onPointerUp: PointerEventHandler<HTMLDivElement>;
  onPointerCancel: PointerEventHandler<HTMLDivElement>;
  onLostPointerCapture: PointerEventHandler<HTMLDivElement>;
};

function SwapPaneIcon() {
  return (
    <svg viewBox="0 0 18 18" aria-hidden="true">
      <path d="M3 6h11m-3-3 3 3-3 3M15 12H4m3-3-3 3 3 3" />
    </svg>
  );
}

function PanelLayoutIcon() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true">
      <rect x="3.25" y="4" width="13.5" height="12" rx="1.75" />
      <path d="M10 4v12" />
    </svg>
  );
}

function ResetSplitIcon() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true">
      <path d="M4 5.25h12v9.5H4zM10 5.25v9.5" />
      <path d="m6.25 3-2.5 2.25 2.5 2.25M13.75 17l2.5-2.25-2.5-2.25" />
    </svg>
  );
}

function ScrollSyncIcon() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true">
      <path d="M3.5 4.25h4v11.5h-4zM12.5 4.25h4v11.5h-4z" />
      <path d="M10 5.5v9m-2-2 2 2 2-2M8 7.5l2-2 2 2" />
    </svg>
  );
}

function SelectedOptionIcon() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true">
      <path d="m3.5 8.25 2.75 2.75 6.25-6.25" />
    </svg>
  );
}

function PanelLayoutMenu({
  isOpen,
  isScrollSyncEnabled,
  isScrollSyncAvailable,
  isStacked,
  onOpen,
  onClose,
  onScrollSyncToggle,
  onSwapPanes,
  onResetSplit,
}: {
  isOpen: boolean;
  isScrollSyncEnabled: boolean;
  isScrollSyncAvailable: boolean;
  isStacked: boolean;
  onOpen: () => void;
  onClose: () => void;
  onScrollSyncToggle: () => void;
  onSwapPanes: () => void;
  onResetSplit: () => void;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const syncState = !isScrollSyncEnabled
    ? "off"
    : isScrollSyncAvailable
      ? "on"
      : "paused";
  const triggerLabel =
    syncState === "on"
      ? "패널 배치, 스크롤 동기화 켜짐"
      : syncState === "paused"
        ? "패널 배치, 스크롤 동기화 일시 중지"
        : "패널 배치, 스크롤 동기화 꺼짐";

  function getMenuItems() {
    return Array.from(
      menuRef.current?.querySelectorAll<HTMLButtonElement>(
        '[role^="menuitem"]:not(:disabled)',
      ) ?? [],
    );
  }

  function closeAndRestoreFocus() {
    onClose();
    window.requestAnimationFrame(() => triggerRef.current?.focus());
  }

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const focusFrame = window.requestAnimationFrame(() =>
      getMenuItems()[0]?.focus(),
    );

    function handleOutsidePointerDown(event: globalThis.PointerEvent) {
      if (
        event.target instanceof Node &&
        !rootRef.current?.contains(event.target)
      ) {
        onClose();
      }
    }

    document.addEventListener("pointerdown", handleOutsidePointerDown);
    return () => {
      window.cancelAnimationFrame(focusFrame);
      document.removeEventListener("pointerdown", handleOutsidePointerDown);
    };
  }, [isOpen, onClose]);

  function handleMenuKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      closeAndRestoreFocus();
      return;
    }

    if (event.key === "Tab") {
      onClose();
      return;
    }

    const items = getMenuItems();
    const currentIndex = items.indexOf(document.activeElement as HTMLButtonElement);
    let nextIndex: number | null = null;

    if (event.key === "ArrowDown") {
      nextIndex = (currentIndex + 1 + items.length) % items.length;
    } else if (event.key === "ArrowUp") {
      nextIndex = (currentIndex - 1 + items.length) % items.length;
    } else if (event.key === "Home") {
      nextIndex = 0;
    } else if (event.key === "End") {
      nextIndex = items.length - 1;
    }

    if (nextIndex !== null) {
      event.preventDefault();
      items[nextIndex]?.focus();
    }
  }

  function runAndClose(action: () => void) {
    action();
    closeAndRestoreFocus();
  }

  return (
    <div ref={rootRef} className="panel-layout-control">
      <button
        ref={triggerRef}
        className="pane-layout-button"
        data-sync-state={syncState}
        type="button"
        aria-label={triggerLabel}
        aria-haspopup="menu"
        aria-expanded={isOpen}
        aria-controls="panel-layout-menu"
        title={triggerLabel}
        onClick={() => (isOpen ? closeAndRestoreFocus() : onOpen())}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown" && !isOpen) {
            event.preventDefault();
            onOpen();
          }
        }}
      >
        <PanelLayoutIcon />
        {isScrollSyncEnabled ? (
          <span className="panel-layout-sync-indicator" aria-hidden="true" />
        ) : null}
      </button>

      {isOpen ? (
        <div
          ref={menuRef}
          id="panel-layout-menu"
          className="panel-layout-menu"
          role="menu"
          aria-label="패널 배치"
          onKeyDown={handleMenuKeyDown}
        >
          <button
            type="button"
            className="panel-layout-menu-item"
            role="menuitemcheckbox"
            aria-checked={isScrollSyncEnabled}
            aria-disabled={!isScrollSyncAvailable}
            disabled={!isScrollSyncAvailable}
            onClick={() => {
              if (isScrollSyncAvailable) {
                onScrollSyncToggle();
              }
            }}
          >
            <ScrollSyncIcon />
            <span className="panel-layout-menu-copy">
              <span>스크롤 동기화</span>
              {!isScrollSyncAvailable ? <span>Markdown 화면에서 사용 가능</span> : null}
            </span>
            <span className="panel-layout-menu-check" aria-hidden="true">
              {isScrollSyncEnabled ? <SelectedOptionIcon /> : null}
            </span>
          </button>
          <button
            type="button"
            className="panel-layout-menu-item"
            role="menuitem"
            onClick={() => runAndClose(onSwapPanes)}
          >
            <SwapPaneIcon />
            <span>{isStacked ? "패널 순서 바꾸기" : "좌우 위치 바꾸기"}</span>
          </button>
          {!isStacked ? (
            <button
              type="button"
              className="panel-layout-menu-item"
              role="menuitem"
              onClick={() => runAndClose(onResetSplit)}
            >
              <ResetSplitIcon />
              <span>패널 너비 50:50으로 초기화</span>
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export function PaneDivider({
  dividerRef,
  isPreviewFocusMode,
  isMenuOpen,
  isScrollSyncEnabled,
  isScrollSyncAvailable,
  isStacked,
  onMenuOpen,
  onMenuClose,
  onScrollSyncToggle,
  onSwapPanes,
  onResetSplit,
  onKeyDown,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onPointerCancel,
  onLostPointerCapture,
}: PaneDividerProps) {
  return (
    <div
      className="pane-divider"
      aria-hidden={isPreviewFocusMode || undefined}
      inert={isPreviewFocusMode}
    >
      <div
        ref={dividerRef}
        className="pane-divider-handle"
        role="separator"
        aria-label="패널 너비 조절"
        aria-orientation="vertical"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={50}
        tabIndex={0}
        title="드래그하여 패널 너비 조절 · 더블 클릭하여 초기화"
        onDoubleClick={onResetSplit}
        onKeyDown={onKeyDown}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerCancel}
        onLostPointerCapture={onLostPointerCapture}
      />
      <PanelLayoutMenu
        isOpen={isMenuOpen}
        isScrollSyncEnabled={isScrollSyncEnabled}
        isScrollSyncAvailable={isScrollSyncAvailable}
        isStacked={isStacked}
        onOpen={onMenuOpen}
        onClose={onMenuClose}
        onScrollSyncToggle={onScrollSyncToggle}
        onSwapPanes={onSwapPanes}
        onResetSplit={onResetSplit}
      />
    </div>
  );
}
