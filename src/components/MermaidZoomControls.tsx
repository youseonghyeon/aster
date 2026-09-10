import { memo } from "react";
import { AssetIcon } from "./icons/AssetIcon";
import fitWidthIcon from "../assets/icons/fit-width.svg";
import zoomOutIcon from "../assets/icons/zoom-out.svg";
import openLargeIcon from "../assets/icons/focus-enter.svg";
import zoomInIcon from "../assets/icons/zoom-in.svg";

type MermaidZoomControlsProps = {
  zoomPercent: number;
  disabled: boolean;
  onZoomOut: () => void;
  onZoomIn: () => void;
  onFitWidth: () => void;
  onOpenLargeView?: (trigger: HTMLButtonElement) => void;
};

export const MermaidZoomControls = memo(function MermaidZoomControls({
  zoomPercent,
  disabled,
  onZoomOut,
  onZoomIn,
  onFitWidth,
  onOpenLargeView,
}: MermaidZoomControlsProps) {
  return (
    <div
      className="mermaid-diagram-controls"
      role="group"
      aria-label="다이어그램 확대 및 축소"
      aria-busy={disabled}
      data-preview-search-ignore="true"
    >
      <button
        type="button"
        className="mermaid-diagram-control-button is-icon"
        aria-label="다이어그램 축소"
        title="다이어그램 축소"
        disabled={disabled || zoomPercent <= 25}
        onClick={onZoomOut}
      >
        <AssetIcon src={zoomOutIcon} />
      </button>
      <button
        type="button"
        className="mermaid-diagram-control-button is-icon"
        aria-label="다이어그램 확대"
        title="다이어그램 확대"
        disabled={disabled || zoomPercent >= 200}
        onClick={onZoomIn}
      >
        <AssetIcon src={zoomInIcon} />
      </button>
      <button
        type="button"
        className="mermaid-diagram-control-button is-icon is-fit"
        aria-label="너비 맞춤"
        title="너비 맞춤"
        disabled={disabled}
        onClick={onFitWidth}
      >
        <AssetIcon src={fitWidthIcon} />
      </button>
      {onOpenLargeView ? (
        <button
          type="button"
          className="mermaid-diagram-control-button is-icon"
          aria-label="다이어그램 크게 보기"
          title="다이어그램 크게 보기"
          disabled={disabled}
          onClick={(event) => onOpenLargeView(event.currentTarget)}
        >
          <AssetIcon src={openLargeIcon} />
        </button>
      ) : null}
    </div>
  );
});
