import { describe, expect, it } from "vitest";
import { getExternalFileObservation } from "./useExternalFileStatus";

describe("external file observations", () => {
  it("clears a notice when the loaded revision is still current", () => {
    expect(
      getExternalFileObservation(
        { kind: "available", revision: "same" },
        "same",
        1,
      ),
    ).toEqual({ state: null, unavailableObservationCount: 0 });
  });

  it("reports a changed revision immediately", () => {
    expect(
      getExternalFileObservation(
        { kind: "available", revision: "next" },
        "current",
        0,
      ),
    ).toEqual({
      state: {
        kind: "modified",
        revision: "next",
        observationKey: "modified:next",
      },
      unavailableObservationCount: 0,
    });
  });

  it("requires two consecutive unavailable observations", () => {
    const first = getExternalFileObservation(
      { kind: "unavailable", message: "missing" },
      "current",
      0,
    );
    expect(first).toEqual({
      state: undefined,
      unavailableObservationCount: 1,
    });

    expect(
      getExternalFileObservation(
        { kind: "unavailable", message: "missing" },
        "current",
        first.unavailableObservationCount,
      ),
    ).toEqual({
      state: {
        kind: "unavailable",
        message: "missing",
        observationKey: "unavailable:missing",
      },
      unavailableObservationCount: 2,
    });
  });
});
