export type FolderBrowserView = "files" | "recent";

export type FolderBrowserPreferences = {
  rootPath: string | null;
  expandedPaths: string[];
  view: FolderBrowserView;
  sidebarWidth: number;
};

export const folderBrowserStorageKey = "aster.folder-browser:v1";
export const defaultFolderSidebarWidth = 280;
export const minFolderSidebarWidth = 220;
export const maxFolderSidebarWidth = 420;
const maxExpandedPaths = 100;

export const defaultFolderBrowserPreferences: FolderBrowserPreferences = {
  rootPath: null,
  expandedPaths: [],
  view: "files",
  sidebarWidth: defaultFolderSidebarWidth,
};

function isValidRelativePath(path: unknown): path is string {
  return (
    typeof path === "string" &&
    path.length > 0 &&
    path.length <= 2_048 &&
    !path.startsWith("/") &&
    !path.split(/[\\/]/).includes("..")
  );
}

export function clampFolderSidebarWidth(width: number) {
  return Math.min(
    maxFolderSidebarWidth,
    Math.max(minFolderSidebarWidth, Math.round(width)),
  );
}

export function loadFolderBrowserPreferences(): FolderBrowserPreferences {
  try {
    const value = localStorage.getItem(folderBrowserStorageKey);
    if (!value) return defaultFolderBrowserPreferences;
    const parsed = JSON.parse(value) as Partial<FolderBrowserPreferences>;
    const expandedPaths = Array.isArray(parsed.expandedPaths)
      ? Array.from(new Set(parsed.expandedPaths.filter(isValidRelativePath))).slice(
          0,
          maxExpandedPaths,
        )
      : [];
    return {
      rootPath:
        typeof parsed.rootPath === "string" && parsed.rootPath
          ? parsed.rootPath
          : null,
      expandedPaths,
      view: parsed.view === "recent" ? "recent" : "files",
      sidebarWidth:
        typeof parsed.sidebarWidth === "number" &&
        Number.isFinite(parsed.sidebarWidth)
          ? clampFolderSidebarWidth(parsed.sidebarWidth)
          : defaultFolderSidebarWidth,
    };
  } catch {
    return defaultFolderBrowserPreferences;
  }
}

export function saveFolderBrowserPreferences(
  preferences: FolderBrowserPreferences,
): boolean {
  try {
    localStorage.setItem(
      folderBrowserStorageKey,
      JSON.stringify({
        rootPath: preferences.rootPath,
        expandedPaths: preferences.expandedPaths.slice(0, maxExpandedPaths),
        view: preferences.view,
        sidebarWidth: clampFolderSidebarWidth(preferences.sidebarWidth),
      }),
    );
    return true;
  } catch {
    return false;
  }
}
