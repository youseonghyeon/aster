import { describe, expect, it } from "vitest";
import { getMermaidFlowchartCurve } from "./mermaid-curve";

describe("Mermaid curve mapping", () => {
  it("maps the complete preference allowlist to Mermaid curves", () => {
    expect(getMermaidFlowchartCurve("curved")).toBe("basis");
    expect(getMermaidFlowchartCurve("straight")).toBe("linear");
    expect(getMermaidFlowchartCurve("orthogonal")).toBe("stepAfter");
  });

  it("rejects values outside the application allowlist at runtime", () => {
    const getCurveFromRuntimeValue = getMermaidFlowchartCurve as (
      value: string,
    ) => unknown;

    for (const value of ["cardinal", "constructor", "toString", "__proto__"]) {
      expect(() => getCurveFromRuntimeValue(value)).toThrow(
        "Unsupported Mermaid curve preference",
      );
    }
  });
});
