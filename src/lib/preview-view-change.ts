export const previewViewChangeEvent = "aster:preview-view-change";

export type PreviewViewChangeDetail = {
  token: object;
  target: HTMLElement;
  phase: "start" | "complete" | "cancel";
};

export type PreviewViewChange = {
  complete: () => void;
  cancel: () => void;
};

/** Transfer position ownership for a user gesture, not for a document reflow. */
export function beginPreviewViewChange(target: HTMLElement): PreviewViewChange {
  const preview = target.closest<HTMLElement>(".preview-scroll");
  const token = {};
  let finished = false;
  const dispatch = (phase: PreviewViewChangeDetail["phase"]) => {
    preview?.dispatchEvent(new CustomEvent<PreviewViewChangeDetail>(previewViewChangeEvent, {
      detail: { token, target, phase },
    }));
  };
  const finish = (phase: "complete" | "cancel") => {
    if (finished) return;
    finished = true;
    dispatch(phase);
  };
  dispatch("start");
  return { complete: () => finish("complete"), cancel: () => finish("cancel") };
}
