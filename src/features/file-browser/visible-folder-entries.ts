import type { FolderEntry } from "./folder-gateway";
import type { FolderTreeState } from "./folder-tree-state";

export type VisibleFolderEntry = FolderEntry & { level: number };
export const maximumVisibleTreeEntries = 6_000;

export function flattenVisibleFolderEntries(
  state: FolderTreeState,
  maximumEntries = Number.POSITIVE_INFINITY,
): VisibleFolderEntry[] {
  const visible: VisibleFolderEntry[] = [];

  function appendDirectory(directory: string, level: number) {
    const listing = state.directories[directory];
    if (
      !listing ||
      (listing.status === "error" && listing.entries.length === 0)
    ) {
      return;
    }
    for (const entry of listing.entries) {
      if (visible.length >= maximumEntries) return;
      visible.push({ ...entry, level });
      if (
        entry.kind === "directory" &&
        state.expandedPaths.has(entry.relativePath)
      ) {
        appendDirectory(entry.relativePath, level + 1);
      }
    }
  }

  appendDirectory("", 1);
  return visible;
}

