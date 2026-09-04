import { describe, expect, it } from "vitest";
import {
  loadCachedUpdateCheck,
  saveCachedUpdateCheck,
  updateCheckIntervalMs,
  type UpdateCheckResult,
} from "./update-check";

const result: UpdateCheckResult = {
  currentVersion: "1.7.0",
  latestVersion: "1.8.0",
  releaseUrl: "https://github.com/youseonghyeon/aster/releases/tag/v1.8.0",
  updateAvailable: true,
};

describe("update check cache", () => {
  it("reuses a fresh result for the same installed version", () => {
    saveCachedUpdateCheck(result, 1_000);

    expect(loadCachedUpdateCheck("1.7.0", 2_000)).toEqual(result);
  });

  it("rejects stale results and results from another installed version", () => {
    saveCachedUpdateCheck(result, 1_000);

    expect(
      loadCachedUpdateCheck("1.7.0", 1_000 + updateCheckIntervalMs),
    ).toBeNull();
    expect(loadCachedUpdateCheck("1.7.1", 2_000)).toBeNull();
  });
});
