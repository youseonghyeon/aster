import {
  useCallback,
  useRef,
  type MouseEventHandler,
  type PointerEventHandler,
} from "react";

const dragThresholdSquared = 16;
const interactiveSelector =
  "a[href], button, input, select, textarea, summary, [role='button'], [role='slider'], [role='separator']";

type PointerGesture = {
  pointerId: number;
  startX: number;
  startY: number;
  didMove: boolean;
  startedInteractive: boolean;
};

function isInteractiveTarget(target: EventTarget | null) {
  return target instanceof Element && Boolean(target.closest(interactiveSelector));
}

function selectionBelongsTo(container: HTMLElement, selection: Selection) {
  return Boolean(
    (selection.anchorNode && container.contains(selection.anchorNode)) ||
      (selection.focusNode && container.contains(selection.focusNode)),
  );
}

export function usePreviewSelectionDismissal(): {
  onPointerDown: PointerEventHandler<HTMLDivElement>;
  onPointerMove: PointerEventHandler<HTMLDivElement>;
  onPointerUp: PointerEventHandler<HTMLDivElement>;
  onPointerCancel: PointerEventHandler<HTMLDivElement>;
  onClick: MouseEventHandler<HTMLDivElement>;
} {
  const activeGestureRef = useRef<PointerGesture | null>(null);
  const completedGestureRef = useRef<PointerGesture | null>(null);

  const updateMovement = useCallback((clientX: number, clientY: number) => {
    const gesture = activeGestureRef.current;
    if (!gesture || gesture.didMove) return;

    const deltaX = clientX - gesture.startX;
    const deltaY = clientY - gesture.startY;
    if (deltaX * deltaX + deltaY * deltaY >= dragThresholdSquared) {
      gesture.didMove = true;
    }
  }, []);

  const onPointerDown = useCallback<PointerEventHandler<HTMLDivElement>>(
    (event) => {
      completedGestureRef.current = null;
      if (event.button !== 0 || event.isPrimary === false) {
        activeGestureRef.current = null;
        return;
      }

      activeGestureRef.current = {
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        didMove: false,
        startedInteractive: isInteractiveTarget(event.target),
      };
    },
    [],
  );

  const onPointerMove = useCallback<PointerEventHandler<HTMLDivElement>>(
    (event) => {
      if (activeGestureRef.current?.pointerId !== event.pointerId) return;
      updateMovement(event.clientX, event.clientY);
    },
    [updateMovement],
  );

  const onPointerUp = useCallback<PointerEventHandler<HTMLDivElement>>(
    (event) => {
      const gesture = activeGestureRef.current;
      if (!gesture || gesture.pointerId !== event.pointerId) return;
      updateMovement(event.clientX, event.clientY);
      completedGestureRef.current = gesture;
      activeGestureRef.current = null;
    },
    [updateMovement],
  );

  const onPointerCancel = useCallback<PointerEventHandler<HTMLDivElement>>(
    () => {
      activeGestureRef.current = null;
      completedGestureRef.current = null;
    },
    [],
  );

  const onClick = useCallback<MouseEventHandler<HTMLDivElement>>((event) => {
    const gesture = completedGestureRef.current;
    completedGestureRef.current = null;
    if (
      event.detail !== 1 ||
      !gesture ||
      gesture.didMove ||
      gesture.startedInteractive ||
      isInteractiveTarget(event.target)
    ) {
      return;
    }

    const selection = window.getSelection();
    if (
      !selection ||
      selection.rangeCount === 0 ||
      selection.isCollapsed ||
      !selectionBelongsTo(event.currentTarget, selection)
    ) {
      return;
    }

    selection.removeAllRanges();
  }, []);

  return {
    onPointerDown,
    onPointerMove,
    onPointerUp,
    onPointerCancel,
    onClick,
  };
}
