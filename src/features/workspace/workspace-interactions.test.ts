import { describe, expect, it } from "vitest";
import {
  createWorkspaceInteractionState,
  getEscapeOwner,
  workspaceInteractionReducer,
} from "./workspace-interactions";

describe("workspace interaction transitions", () => {
  it("keeps an inset sidebar when settings toggle", () => {
    let state = createWorkspaceInteractionState(true);
    state = workspaceInteractionReducer(state, {
      type: "toggle-stage-sidebar",
      sidebar: "outline",
    });
    state = workspaceInteractionReducer(state, { type: "toggle-settings" });

    expect(state.stageSidebar).toBe("outline");
    expect(state.isSettingsOpen).toBe(true);
  });

  it("makes modal sidebar and settings mutually exclusive", () => {
    let state = createWorkspaceInteractionState(false);
    state = workspaceInteractionReducer(state, {
      type: "toggle-stage-sidebar",
      sidebar: "outline",
    });
    state = workspaceInteractionReducer(state, { type: "toggle-settings" });

    expect(state.stageSidebar).toBeNull();
    expect(state.isSettingsOpen).toBe(true);
  });

  it("preserves only an inset outline during document actions", () => {
    const insetOutline = workspaceInteractionReducer(
      { ...createWorkspaceInteractionState(true), stageSidebar: "outline" },
      { type: "start-document-action" },
    );
    const insetRecent = workspaceInteractionReducer(
      { ...createWorkspaceInteractionState(true), stageSidebar: "recent" },
      { type: "start-document-action" },
    );
    const modalOutline = workspaceInteractionReducer(
      { ...createWorkspaceInteractionState(false), stageSidebar: "outline" },
      { type: "start-document-action" },
    );

    expect(insetOutline.stageSidebar).toBe("outline");
    expect(insetRecent.stageSidebar).toBeNull();
    expect(modalOutline.stageSidebar).toBeNull();
  });

  it("closes overlays when an inset sidebar becomes modal", () => {
    const state = workspaceInteractionReducer(
      {
        ...createWorkspaceInteractionState(true),
        stageSidebar: "outline",
        isSettingsOpen: true,
        isPanelLayoutMenuOpen: true,
      },
      { type: "set-sidebar-inset", isInset: false },
    );

    expect(state.isSidebarInset).toBe(false);
    expect(state.isSettingsOpen).toBe(false);
    expect(state.isPanelLayoutMenuOpen).toBe(false);
  });
});

describe("Escape ownership", () => {
  it("lets the workspace close its top layer outside an inset sidebar", () => {
    expect(
      getEscapeOwner({
        hasStageSidebar: true,
        isSidebarInset: true,
        isEventInsideSidebar: false,
        hasWorkspaceLayer: true,
      }),
    ).toBe("workspace");
  });

  it("gives modal or focused sidebar priority", () => {
    expect(
      getEscapeOwner({
        hasStageSidebar: true,
        isSidebarInset: false,
        isEventInsideSidebar: false,
        hasWorkspaceLayer: true,
      }),
    ).toBe("sidebar");
    expect(
      getEscapeOwner({
        hasStageSidebar: true,
        isSidebarInset: true,
        isEventInsideSidebar: true,
        hasWorkspaceLayer: true,
      }),
    ).toBe("sidebar");
  });
});
