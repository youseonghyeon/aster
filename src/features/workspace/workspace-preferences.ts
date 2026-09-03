import type { StageSidebar } from "./workspace-interactions";
import type { PaneKind } from "./workspace-types";

export type WorkspacePreferences = {
  leftPane: PaneKind;
  splitPercent: number;
  stageSidebar: StageSidebar;
};

export const workspacePreferencesStorageKey = "aster:workspace:v1";

export const defaultWorkspacePreferences: WorkspacePreferences = {
  leftPane: "editor",
  splitPercent: 50,
  stageSidebar: null,
};

const stageSidebars = new Set<StageSidebar>([
  null,
  "files",
  "outline",
  "recent",
]);

function normalizedSplitPercent(value: unknown) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return defaultWorkspacePreferences.splitPercent;
  }

  return Math.min(100, Math.max(0, value));
}

export function loadWorkspacePreferences(): WorkspacePreferences {
  try {
    const value = localStorage.getItem(workspacePreferencesStorageKey);
    if (!value) return defaultWorkspacePreferences;

    const parsed = JSON.parse(value) as Partial<WorkspacePreferences>;
    return {
      leftPane: parsed.leftPane === "preview" ? "preview" : "editor",
      splitPercent: normalizedSplitPercent(parsed.splitPercent),
      stageSidebar: stageSidebars.has(parsed.stageSidebar ?? null)
        ? (parsed.stageSidebar ?? null)
        : null,
    };
  } catch {
    return defaultWorkspacePreferences;
  }
}

export function saveWorkspacePreferences(
  preferences: WorkspacePreferences,
): boolean {
  try {
    localStorage.setItem(
      workspacePreferencesStorageKey,
      JSON.stringify({
        leftPane: preferences.leftPane,
        splitPercent: normalizedSplitPercent(preferences.splitPercent),
        stageSidebar: preferences.stageSidebar,
      }),
    );
    return true;
  } catch {
    return false;
  }
}
