export type StageSidebar = "outline" | "recent" | null;

export type WorkspaceInteractionState = {
  stageSidebar: StageSidebar;
  isPreviewFocusMode: boolean;
  isSidebarInset: boolean;
  isNotesOpen: boolean;
  isSettingsOpen: boolean;
  isPanelLayoutMenuOpen: boolean;
};

export type WorkspaceInteractionAction =
  | { type: "toggle-stage-sidebar"; sidebar: Exclude<StageSidebar, null> }
  | { type: "close-stage-sidebar" }
  | { type: "toggle-settings" }
  | { type: "close-settings" }
  | { type: "open-panel-layout-menu" }
  | { type: "close-panel-layout-menu" }
  | { type: "set-sidebar-inset"; isInset: boolean }
  | { type: "start-document-action" }
  | { type: "set-notes-open"; isOpen: boolean }
  | { type: "set-preview-focus"; isOpen: boolean };

export function createWorkspaceInteractionState(
  isSidebarInset: boolean,
): WorkspaceInteractionState {
  return {
    stageSidebar: null,
    isPreviewFocusMode: false,
    isSidebarInset,
    isNotesOpen: false,
    isSettingsOpen: false,
    isPanelLayoutMenuOpen: false,
  };
}

function sidebarForDocumentAction(state: WorkspaceInteractionState) {
  return state.stageSidebar === "outline" && state.isSidebarInset
    ? state.stageSidebar
    : null;
}

export function workspaceInteractionReducer(
  state: WorkspaceInteractionState,
  action: WorkspaceInteractionAction,
): WorkspaceInteractionState {
  switch (action.type) {
    case "toggle-stage-sidebar":
      return {
        ...state,
        stageSidebar:
          state.stageSidebar === action.sidebar ? null : action.sidebar,
        isSettingsOpen: false,
        isPanelLayoutMenuOpen: false,
      };
    case "close-stage-sidebar":
      return { ...state, stageSidebar: null };
    case "toggle-settings":
      return {
        ...state,
        stageSidebar: state.isSidebarInset ? state.stageSidebar : null,
        isSettingsOpen: !state.isSettingsOpen,
        isPanelLayoutMenuOpen: false,
      };
    case "close-settings":
      return { ...state, isSettingsOpen: false };
    case "open-panel-layout-menu":
      return {
        ...state,
        isSettingsOpen: false,
        isPanelLayoutMenuOpen: true,
      };
    case "close-panel-layout-menu":
      return { ...state, isPanelLayoutMenuOpen: false };
    case "set-sidebar-inset":
      return {
        ...state,
        isSidebarInset: action.isInset,
        isSettingsOpen:
          !action.isInset && state.stageSidebar !== null
            ? false
            : state.isSettingsOpen,
        isPanelLayoutMenuOpen:
          !action.isInset && state.stageSidebar !== null
            ? false
            : state.isPanelLayoutMenuOpen,
      };
    case "start-document-action":
      return {
        ...state,
        stageSidebar: sidebarForDocumentAction(state),
        isSettingsOpen: false,
        isPanelLayoutMenuOpen: false,
      };
    case "set-notes-open":
      return { ...state, isNotesOpen: action.isOpen };
    case "set-preview-focus":
      return { ...state, isPreviewFocusMode: action.isOpen };
  }
}

export type EscapeOwner = "workspace" | "sidebar" | "none";

export function getEscapeOwner({
  hasStageSidebar,
  isSidebarInset,
  isEventInsideSidebar,
  hasWorkspaceLayer,
}: {
  hasStageSidebar: boolean;
  isSidebarInset: boolean;
  isEventInsideSidebar: boolean;
  hasWorkspaceLayer: boolean;
}): EscapeOwner {
  if (!hasStageSidebar) {
    return hasWorkspaceLayer ? "workspace" : "none";
  }

  if (!isSidebarInset || isEventInsideSidebar) {
    return "sidebar";
  }

  return hasWorkspaceLayer ? "workspace" : "sidebar";
}
