import { memo } from "react";

type MermaidZoomControlsProps = {
  zoomPercent: number;
  disabled: boolean;
  onZoomOut: () => void;
  onReset: () => void;
  onZoomIn: () => void;
  onFitWidth: () => void;
};

export const MermaidZoomControls = memo(function MermaidZoomControls({
  zoomPercent,
  disabled,
  onZoomOut,
  onReset,
  onZoomIn,
  onFitWidth,
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
        −
      </button>
      <button
        type="button"
        className="mermaid-diagram-control-button is-percent"
        aria-label={`${zoomPercent}% — 100%로 재설정`}
        title="100%로 재설정"
        disabled={disabled || zoomPercent === 100}
        onClick={onReset}
      >
        {zoomPercent}%
      </button>
      <button
        type="button"
        className="mermaid-diagram-control-button is-icon"
        aria-label="다이어그램 확대"
        title="다이어그램 확대"
        disabled={disabled || zoomPercent >= 200}
        onClick={onZoomIn}
      >
        +
      </button>
      <button
        type="button"
        className="mermaid-diagram-control-button is-fit"
        aria-label="현재 폭에 한 번 맞춤"
        title="현재 폭에 한 번 맞춤"
        disabled={disabled}
        onClick={onFitWidth}
      >
        너비 맞춤
      </button>
    </div>
  );
});
