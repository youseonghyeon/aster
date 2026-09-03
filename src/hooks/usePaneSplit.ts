import {
  useCallback,
  useEffect,
  useRef,
  type KeyboardEvent,
  type PointerEvent,
  type RefObject,
} from "react";
import {
  clampSplitPercent,
  getKeyboardSplitPercent,
  getPointerSplitPercent,
  getSwappedSplitPercent,
  hasMeaningfulSplitDrag,
} from "../lib/pane-split";

type SplitDragState = {
  pointerId: number;
  captureElement: HTMLDivElement;
  startClientX: number;
  startRequestedPercent: number;
  startAppliedPercent: number;
  boundsLeft: number;
  boundsWidth: number;
  latestPercent: number;
  didMove: boolean;
  frameId: number | null;
};

type UsePaneSplitOptions = {
  workspaceRef: RefObject<HTMLElement | null>;
  dividerRef: RefObject<HTMLDivElement | null>;
  splitGuideRef: RefObject<HTMLDivElement | null>;
  isPreviewFocusMode: boolean;
  initialSplitPercent?: number;
  onSplitChange?: (splitPercent: number) => void;
};

const ignoreSplitChange = () => undefined;

export function usePaneSplit({
  workspaceRef,
  dividerRef,
  splitGuideRef,
  isPreviewFocusMode,
  initialSplitPercent = 50,
  onSplitChange = ignoreSplitChange,
}: UsePaneSplitOptions) {
  const requestedSplitPercentRef = useRef(initialSplitPercent);
  const appliedSplitPercentRef = useRef(initialSplitPercent);
  const splitDragRef = useRef<SplitDragState | null>(null);

  const applySplit = useCallback((requestedPercent: number) => {
    const workspace = workspaceRef.current;

    if (!workspace) {
      return;
    }

    const workspaceWidth = workspace.getBoundingClientRect().width;
    const appliedPercent = clampSplitPercent(
      requestedPercent,
      workspaceWidth,
      window.matchMedia("(max-width: 720px)").matches,
    );

    workspace.style.setProperty("--left-pane-width", `${appliedPercent}%`);
    appliedSplitPercentRef.current = appliedPercent;
    dividerRef.current?.setAttribute(
      "aria-valuenow",
      Math.round(appliedPercent).toString(),
    );
  }, [dividerRef, workspaceRef]);

  const updateSplit = useCallback((nextPercent: number) => {
    requestedSplitPercentRef.current = nextPercent;
    applySplit(nextPercent);
    onSplitChange(nextPercent);
  }, [applySplit, onSplitChange]);

  function getDragRequestedPercent(state: SplitDragState, clientX: number) {
    return getPointerSplitPercent(
      clientX,
      state.boundsLeft,
      state.boundsWidth,
    );
  }

  function getDragSplitPercent(state: SplitDragState, clientX: number) {
    return clampSplitPercent(
      getDragRequestedPercent(state, clientX),
      state.boundsWidth,
      false,
    );
  }

  const renderSplitGuide = useCallback((state: SplitDragState) => {
    const guide = splitGuideRef.current;

    if (!guide) {
      return;
    }

    const guidePercent = state.didMove
      ? state.latestPercent
      : state.startAppliedPercent;
    const guidePosition = (guidePercent / 100) * state.boundsWidth;
    guide.style.transform = `translate3d(${guidePosition}px, 0, 0)`;
  }, [splitGuideRef]);

  const scheduleSplitGuide = useCallback((state: SplitDragState) => {
    if (state.frameId !== null) {
      return;
    }

    state.frameId = window.requestAnimationFrame(() => {
      state.frameId = null;

      if (splitDragRef.current === state) {
        renderSplitGuide(state);
      }
    });
  }, [renderSplitGuide]);

  const cleanUpSplitDrag = useCallback((state: SplitDragState) => {
    if (state.frameId !== null) {
      window.cancelAnimationFrame(state.frameId);
      state.frameId = null;
    }

    if (splitDragRef.current === state) {
      splitDragRef.current = null;
    }

    try {
      if (state.captureElement.hasPointerCapture(state.pointerId)) {
        state.captureElement.releasePointerCapture(state.pointerId);
      }
    } catch {
      // The element may already be detached during unmount cleanup.
    }

    workspaceRef.current?.classList.remove(
      "is-resizing",
      "is-split-guide-visible",
    );
    splitGuideRef.current?.style.removeProperty("transform");
  }, [splitGuideRef, workspaceRef]);

  const cancelSplitDrag = useCallback((pointerId?: number) => {
    const state = splitDragRef.current;

    if (!state || (pointerId !== undefined && state.pointerId !== pointerId)) {
      return;
    }

    requestedSplitPercentRef.current = state.startRequestedPercent;
    cleanUpSplitDrag(state);
  }, [cleanUpSplitDrag]);

  const handleDividerPointerDown = useCallback((event: PointerEvent<HTMLDivElement>) => {
    if (!event.isPrimary || event.button !== 0 || splitDragRef.current) {
      return;
    }

    const workspace = workspaceRef.current;

    if (!workspace) {
      return;
    }

    event.preventDefault();
    const bounds = workspace.getBoundingClientRect();
    const state: SplitDragState = {
      pointerId: event.pointerId,
      captureElement: event.currentTarget,
      startClientX: event.clientX,
      startRequestedPercent: requestedSplitPercentRef.current,
      startAppliedPercent: appliedSplitPercentRef.current,
      boundsLeft: bounds.left,
      boundsWidth: bounds.width,
      latestPercent: appliedSplitPercentRef.current,
      didMove: false,
      frameId: null,
    };

    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      return;
    }

    splitDragRef.current = state;
    workspace.classList.add("is-resizing", "is-split-guide-visible");
    renderSplitGuide(state);
  }, [renderSplitGuide, workspaceRef]);

  const handleDividerPointerMove = useCallback((event: PointerEvent<HTMLDivElement>) => {
    const state = splitDragRef.current;

    if (
      !state ||
      state.pointerId !== event.pointerId ||
      !event.currentTarget.hasPointerCapture(event.pointerId) ||
      !hasMeaningfulSplitDrag(state.startClientX, event.clientX)
    ) {
      return;
    }

    state.didMove = true;
    state.latestPercent = getDragSplitPercent(state, event.clientX);
    scheduleSplitGuide(state);
  }, [scheduleSplitGuide]);

  const handleDividerPointerUp = useCallback((event: PointerEvent<HTMLDivElement>) => {
    const state = splitDragRef.current;

    if (!state || state.pointerId !== event.pointerId) {
      return;
    }

    const didMove =
      state.didMove ||
      hasMeaningfulSplitDrag(state.startClientX, event.clientX);
    const finalRequestedPercent = getDragRequestedPercent(state, event.clientX);
    cleanUpSplitDrag(state);

    if (didMove) {
      updateSplit(finalRequestedPercent);
    } else {
      requestedSplitPercentRef.current = state.startRequestedPercent;
    }
  }, [cleanUpSplitDrag, updateSplit]);

  const handleDividerPointerCancel = useCallback((event: PointerEvent<HTMLDivElement>) => {
    cancelSplitDrag(event.pointerId);
  }, [cancelSplitDrag]);

  const handleDividerLostPointerCapture = useCallback((event: PointerEvent<HTMLDivElement>) => {
    cancelSplitDrag(event.pointerId);
  }, [cancelSplitDrag]);

  const handleDividerKeyDown = useCallback((event: KeyboardEvent<HTMLDivElement>) => {
    cancelSplitDrag();

    const nextPercent = getKeyboardSplitPercent(
      appliedSplitPercentRef.current,
      event.key,
      event.shiftKey,
    );

    if (nextPercent === null) {
      return;
    }

    event.preventDefault();
    updateSplit(nextPercent);
  }, [cancelSplitDrag, updateSplit]);

  const swapSplit = useCallback(() => {
    if (window.matchMedia("(min-width: 721px)").matches) {
      updateSplit(getSwappedSplitPercent(requestedSplitPercentRef.current));
    }
  }, [updateSplit]);

  useEffect(() => {
    const workspace = workspaceRef.current;

    if (!workspace) {
      return;
    }

    applySplit(requestedSplitPercentRef.current);
    const resizeObserver = new ResizeObserver(() => {
      cancelSplitDrag();
      applySplit(requestedSplitPercentRef.current);
    });

    resizeObserver.observe(workspace);
    return () => resizeObserver.disconnect();
  }, [applySplit, cancelSplitDrag, workspaceRef]);

  useEffect(() => {
    function handleWindowBlur() {
      cancelSplitDrag();
    }

    function handleVisibilityChange() {
      if (document.hidden) {
        cancelSplitDrag();
      }
    }

    window.addEventListener("blur", handleWindowBlur);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      window.removeEventListener("blur", handleWindowBlur);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      cancelSplitDrag();
    };
  }, [cancelSplitDrag]);

  useEffect(() => {
    if (isPreviewFocusMode) {
      cancelSplitDrag();
    }
  }, [cancelSplitDrag, isPreviewFocusMode]);

  return {
    updateSplit,
    swapSplit,
    handleDividerKeyDown,
    handleDividerPointerDown,
    handleDividerPointerMove,
    handleDividerPointerUp,
    handleDividerPointerCancel,
    handleDividerLostPointerCapture,
  };
}
