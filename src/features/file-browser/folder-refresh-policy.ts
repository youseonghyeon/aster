import type { FolderTreeState } from "./folder-tree-state";

export type FolderRefreshMetrics = {
  entryCount: number;
  hasTruncated: boolean;
  hasError: boolean;
  durationMs: number;
};

const minimumRefreshDelayMs = 10_000;
const maximumRefreshDelayMs = 60_000;

export function calculateFolderRefreshDelay({
  entryCount,
  hasTruncated,
  hasError,
  durationMs,
}: FolderRefreshMetrics) {
  if (hasTruncated || hasError) return maximumRefreshDelayMs;

  const baseDelay =
    entryCount <= 500
      ? minimumRefreshDelayMs
      : entryCount <= 2_000
        ? 20_000
        : entryCount <= 6_000
          ? 45_000
          : maximumRefreshDelayMs;
  const durationDelay =
    durationMs >= 1_000
      ? Math.min(maximumRefreshDelayMs, Math.ceil(durationMs * 10))
      : minimumRefreshDelayMs;
  return Math.max(baseDelay, durationDelay);
}

export function collectFolderRefreshMetrics(
  state: FolderTreeState,
  durationMs: number,
): FolderRefreshMetrics {
  let entryCount = 0;
  let hasTruncated = false;
  let hasError = false;
  const targets = new Set(["", ...state.expandedPaths]);

  for (const directory of targets) {
    const listing = state.directories[directory];
    if (!listing) continue;
    entryCount += listing.entries.length;
    hasTruncated ||= listing.truncated;
    hasError ||= listing.status === "error";
  }

  return { entryCount, hasTruncated, hasError, durationMs };
}
