import { describe, expect, it } from "vitest";
import {
  createFolderTreeState,
  folderTreeReducer,
} from "./folder-tree-state";

const root = { token: 7, path: "/docs", name: "docs" };

describe("folder tree state", () => {
  it("ignores stale root and directory responses", () => {
    let state = createFolderTreeState();
    state = folderTreeReducer(state, { type: "root-loading", requestId: 1 });
    state = folderTreeReducer(state, { type: "root-loading", requestId: 2 });
    state = folderTreeReducer(state, {
      type: "root-ready",
      requestId: 1,
      root,
      expandedPaths: [],
    });
    expect(state.root).toBeNull();

    state = folderTreeReducer(state, {
      type: "root-ready",
      requestId: 2,
      root,
      expandedPaths: ["guide"],
    });
    state = folderTreeReducer(state, {
      type: "directory-loading",
      rootToken: 7,
      directory: "guide",
      requestId: 3,
    });
    state = folderTreeReducer(state, {
      type: "directory-ready",
      requestId: 2,
      listing: {
        rootToken: 7,
        directory: "guide",
        entries: [],
        truncated: false,
      },
    });
    expect(state.directories.guide.status).toBe("loading");
  });

  it("keeps directory cache and expansion independent", () => {
    let state = createFolderTreeState();
    state = folderTreeReducer(state, { type: "root-loading", requestId: 1 });
    state = folderTreeReducer(state, {
      type: "root-ready",
      requestId: 1,
      root,
      expandedPaths: [],
    });
    state = folderTreeReducer(state, {
      type: "directory-loading",
      rootToken: 7,
      directory: "",
      requestId: 2,
    });
    state = folderTreeReducer(state, {
      type: "directory-ready",
      requestId: 2,
      listing: {
        rootToken: 7,
        directory: "",
        entries: [
          {
            name: "guide",
            relativePath: "guide",
            path: "/docs/guide",
            kind: "directory",
          },
        ],
        truncated: false,
      },
    });
    state = folderTreeReducer(state, {
      type: "toggle-directory",
      path: "guide",
    });

    expect(state.directories[""].entries[0].name).toBe("guide");
    expect(state.expandedPaths.has("guide")).toBe(true);
  });
});
