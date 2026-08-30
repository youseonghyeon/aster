import type { MermaidConfig } from "mermaid";

export const mermaidCurvePreferences = [
  "curved",
  "straight",
  "orthogonal",
] as const;

export type MermaidCurvePreference =
  (typeof mermaidCurvePreferences)[number];

type FlowchartCurve = NonNullable<
  NonNullable<MermaidConfig["flowchart"]>["curve"]
>;

const mermaidFlowchartCurves = {
  curved: "basis",
  straight: "linear",
  orthogonal: "stepAfter",
} as const satisfies Record<MermaidCurvePreference, FlowchartCurve>;

export function getMermaidFlowchartCurve(
  preference: MermaidCurvePreference,
): FlowchartCurve {
  if (!Object.prototype.hasOwnProperty.call(mermaidFlowchartCurves, preference)) {
    throw new Error("Unsupported Mermaid curve preference");
  }
  return mermaidFlowchartCurves[preference];
}
