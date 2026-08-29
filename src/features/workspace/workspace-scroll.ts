export type ScrollProgress = {
  top: number;
  left: number;
};

export type PreviewScrollProgress = {
  outer: ScrollProgress;
  nested: ScrollProgress[];
};

export function getScrollProgress(element: HTMLElement): ScrollProgress {
  const maximumTop = element.scrollHeight - element.clientHeight;
  const maximumLeft = element.scrollWidth - element.clientWidth;
  return {
    top: maximumTop > 0 ? element.scrollTop / maximumTop : 0,
    left: maximumLeft > 0 ? element.scrollLeft / maximumLeft : 0,
  };
}

export function restoreScrollProgress(
  element: HTMLElement,
  progress: ScrollProgress,
) {
  element.scrollTop =
    progress.top * Math.max(0, element.scrollHeight - element.clientHeight);
  element.scrollLeft =
    progress.left * Math.max(0, element.scrollWidth - element.clientWidth);
}
