import type { CSSProperties } from "react";
import "./AssetIcon.css";

/** Render the shared SVG source in the control's current text color. */
export function AssetIcon({ src, className = "" }: { src: string; className?: string }) {
  return <span className={`aster-asset-icon ${className}`} aria-hidden="true"
    style={{ "--asset-icon": `url("${src}")` } as CSSProperties} />;
}
