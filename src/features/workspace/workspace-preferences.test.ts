import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  defaultWorkspacePreferences,
  loadWorkspacePreferences,
  saveWorkspacePreferences,
  workspacePreferencesStorageKey,
} from "./workspace-preferences";

describe("workspace preferences", () => {
  beforeEach(() => localStorage.clear());

  it("restores pane order, split ratio, and the open sidebar", () => {
    localStorage.setItem(
      workspacePreferencesStorageKey,
      JSON.stringify({
        leftPane: "preview",
        splitPercent: 63.5,
        stageSidebar: "outline",
      }),
    );

    expect(loadWorkspacePreferences()).toEqual({
      leftPane: "preview",
      splitPercent: 63.5,
      stageSidebar: "outline",
    });
  });

  it("restores an explicitly closed sidebar", () => {
    localStorage.setItem(
      workspacePreferencesStorageKey,
      JSON.stringify({
        leftPane: "editor",
        splitPercent: 50,
        stageSidebar: null,
      }),
    );

    expect(loadWorkspacePreferences().stageSidebar).toBeNull();
  });

  it("normalizes corrupt or unsupported fields", () => {
    localStorage.setItem(
      workspacePreferencesStorageKey,
      JSON.stringify({
        leftPane: "notes",
        splitPercent: 130,
        stageSidebar: "settings",
      }),
    );

    expect(loadWorkspacePreferences()).toEqual({
      leftPane: "editor",
      splitPercent: 100,
      stageSidebar: null,
    });

    localStorage.setItem(workspacePreferencesStorageKey, "not-json");
    expect(loadWorkspacePreferences()).toEqual(defaultWorkspacePreferences);
  });

  it("persists a bounded primitive snapshot", () => {
    expect(
      saveWorkspacePreferences({
        leftPane: "preview",
        splitPercent: -20,
        stageSidebar: "files",
      }),
    ).toBe(true);
    expect(
      JSON.parse(localStorage.getItem(workspacePreferencesStorageKey) ?? "{}"),
    ).toEqual({
      leftPane: "preview",
      splitPercent: 0,
      stageSidebar: "files",
    });
  });

  it("reports unavailable storage without throwing", () => {
    const storageWrite = vi
      .spyOn(Storage.prototype, "setItem")
      .mockImplementation(() => {
        throw new Error("storage unavailable");
      });

    expect(saveWorkspacePreferences(defaultWorkspacePreferences)).toBe(false);
    storageWrite.mockRestore();
  });
});
