export const minimumPaneWidth = 240;
export const dividerWidth = 9;
export const minimumDragDistance = 2;

export function clampSplitPercent(
  requestedPercent: number,
  workspaceWidth: number,
  isStacked: boolean,
): number {
  if (
    isStacked ||
    workspaceWidth <= minimumPaneWidth * 2 + dividerWidth
  ) {
    return 50;
  }

  const minimumPercent = (minimumPaneWidth / workspaceWidth) * 100;
  const maximumPercent =
    ((workspaceWidth - dividerWidth - minimumPaneWidth) / workspaceWidth) *
    100;

  return Math.min(
    maximumPercent,
    Math.max(minimumPercent, requestedPercent),
  );
}

export function getPointerSplitPercent(
  clientX: number,
  boundsLeft: number,
  boundsWidth: number,
): number {
  return ((clientX - boundsLeft) / boundsWidth) * 100;
}

export function hasMeaningfulSplitDrag(
  startClientX: number,
  clientX: number,
): boolean {
  return Math.abs(clientX - startClientX) >= minimumDragDistance;
}

export function getKeyboardSplitPercent(
  currentPercent: number,
  key: string,
  shiftKey: boolean,
): number | null {
  const step = shiftKey ? 10 : 2;

  switch (key) {
    case "ArrowLeft":
      return currentPercent - step;
    case "ArrowRight":
      return currentPercent + step;
    case "Home":
      return 0;
    case "End":
      return 100;
    default:
      return null;
  }
}

export function getSwappedSplitPercent(requestedPercent: number): number {
  return 100 - requestedPercent;
}
