import { describe, expect, it } from "vitest";
import type { FolderTreeState } from "./folder-tree-state";
import {
  calculateFolderRefreshDelay,
  collectFolderRefreshMetrics,
} from "./folder-refresh-policy";

describe("folder refresh policy", () => {
  it.each([
    [0, 10_000],
    [500, 10_000],
    [501, 20_000],
    [2_000, 20_000],
    [2_001, 45_000],
    [6_000, 45_000],
    [6_001, 60_000],
  ])("uses the entry-count boundary for %i entries", (entryCount, delay) => {
    expect(
      calculateFolderRefreshDelay({
        entryCount,
        hasTruncated: false,
        hasError: false,
        durationMs: 0,
      }),
    ).toBe(delay);
  });

  it("prioritizes issue backoff and slow refresh duration", () => {
    expect(
      calculateFolderRefreshDelay({
        entryCount: 10,
        hasTruncated: true,
        hasError: false,
        durationMs: 0,
      }),
    ).toBe(60_000);
    expect(
      calculateFolderRefreshDelay({
        entryCount: 10,
        hasTruncated: false,
        hasError: true,
        durationMs: 0,
      }),
    ).toBe(60_000);
    expect(
      calculateFolderRefreshDelay({
        entryCount: 501,
        hasTruncated: false,
        hasError: false,
        durationMs: 3_500,
      }),
    ).toBe(35_000);
    expect(
      calculateFolderRefreshDelay({
        entryCount: 10,
        hasTruncated: false,
        hasError: false,
        durationMs: 8_000,
      }),
    ).toBe(60_000);
  });

  it("counts only the root and currently expanded directories", () => {
    const directory = (count: number, status: "loaded" | "error" = "loaded") => ({
      status,
      requestId: 1,
      entries: Array.from({ length: count }, (_, index) => ({
        name: `${index}.md`,
        relativePath: `${index}.md`,
        path: `/docs/${index}.md`,
        kind: "markdown" as const,
      })),
      truncated: false,
      error: status === "error" ? "실패" : null,
    });
    const state: FolderTreeState = {
      root: { token: 1, path: "/docs", name: "docs" },
      rootStatus: "ready",
      rootRequestId: 1,
      rootError: null,
      expandedPaths: new Set(["open"]),
      selectedPath: null,
      directories: {
        "": directory(2),
        open: directory(3, "error"),
        closed: directory(100),
      },
    };

    expect(collectFolderRefreshMetrics(state, 25)).toEqual({
      entryCount: 5,
      hasTruncated: false,
      hasError: true,
      durationMs: 25,
    });
  });
});
