export const previewLayoutChangeEvent = "aster:preview-layout-change";

export function notifyPreviewLayoutChange(target: HTMLElement) {
  target.dispatchEvent(new Event(previewLayoutChangeEvent, { bubbles: true }));
}
