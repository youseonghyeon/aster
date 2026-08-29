import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { FolderTree, flattenVisibleFolderEntries } from "./FolderTree";
import type { FolderTreeState } from "./folder-tree-state";

function treeState(): FolderTreeState {
  return {
    root: { token: 1, path: "/docs", name: "docs" },
    rootStatus: "ready",
    rootRequestId: 1,
    rootError: null,
    expandedPaths: new Set(["guide"]),
    selectedPath: "README.md",
    directories: {
      "": {
        status: "loaded",
        requestId: 1,
        truncated: false,
        error: null,
        entries: [
          {
            name: "guide",
            relativePath: "guide",
            path: "/docs/guide",
            kind: "directory",
          },
          {
            name: "README.md",
            relativePath: "README.md",
            path: "/docs/README.md",
            kind: "markdown",
          },
          {
            name: "cover.png",
            relativePath: "cover.png",
            path: "/docs/cover.png",
            kind: "image",
          },
        ],
      },
      guide: {
        status: "loaded",
        requestId: 2,
        truncated: false,
        error: null,
        entries: [
          {
            name: "start.md",
            relativePath: "guide/start.md",
            path: "/docs/guide/start.md",
            kind: "markdown",
          },
        ],
      },
    },
  };
}

function renderTree(state = treeState()) {
  const props = {
    state,
    currentDocumentPath: "/docs/README.md",
    isDocumentBusy: false,
    onSelect: vi.fn(),
    onToggleDirectory: vi.fn(),
    onOpenMarkdown: vi.fn(),
    onOpenImage: vi.fn(),
  };
  render(<FolderTree {...props} />);
  return props;
}

describe("FolderTree", () => {
  it("flattens only expanded directory branches", () => {
    expect(
      flattenVisibleFolderEntries(treeState()).map((entry) => [
        entry.relativePath,
        entry.level,
      ]),
    ).toEqual([
      ["guide", 1],
      ["guide/start.md", 2],
      ["README.md", 1],
      ["cover.png", 1],
    ]);
  });

  it("selects on one click and opens Markdown only on double click", async () => {
    const user = userEvent.setup();
    const props = renderTree();
    const readme = screen.getByRole("treeitem", {
      name: "README.md, 현재 문서",
    });

    await user.click(readme);
    expect(props.onSelect).toHaveBeenCalledWith("README.md");
    expect(props.onOpenMarkdown).not.toHaveBeenCalled();

    await user.dblClick(readme);
    expect(props.onOpenMarkdown).toHaveBeenCalledWith("/docs/README.md");
  });

  it("supports arrow navigation, expansion, and explicit Enter activation", async () => {
    const user = userEvent.setup();
    const props = renderTree();
    const guide = screen.getByRole("treeitem", { name: "guide" });
    guide.focus();

    await user.keyboard("{ArrowDown}");
    expect(screen.getByRole("treeitem", { name: "start.md" })).toHaveFocus();
    await user.keyboard("{Enter}");
    expect(props.onOpenMarkdown).toHaveBeenCalledWith("/docs/guide/start.md");

    guide.focus();
    await user.keyboard("{ArrowLeft}");
    expect(props.onToggleDirectory).toHaveBeenCalledWith(
      expect.objectContaining({ relativePath: "guide" }),
    );
  });

  it("opens images through the dedicated callback", async () => {
    const user = userEvent.setup();
    const props = renderTree();
    const image = screen.getByRole("treeitem", { name: "cover.png" });
    image.focus();
    await user.keyboard("{Enter}");
    expect(props.onOpenImage).toHaveBeenCalledWith(
      expect.objectContaining({ relativePath: "cover.png" }),
    );
    expect(props.onOpenMarkdown).not.toHaveBeenCalled();
  });
});
