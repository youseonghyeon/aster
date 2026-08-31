import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { FolderTree, flattenVisibleFolderEntries } from "./FolderTree";
import { showFolderContextMenu } from "./folder-context-menu";
import type { FolderTreeState } from "./folder-tree-state";

vi.mock("./folder-context-menu", () => ({
  showFolderContextMenu: vi.fn(() => Promise.resolve()),
}));

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
    onRetryDirectory: vi.fn(),
    onOpenMarkdown: vi.fn(),
    onOpenImage: vi.fn(),
    onRemoveFile: vi.fn(),
    removingFilePath: null,
  };
  render(<FolderTree {...props} />);
  return props;
}

describe("FolderTree", () => {
  beforeEach(() => {
    vi.mocked(showFolderContextMenu).mockClear();
  });

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

    const doubleClickEvent = new MouseEvent("dblclick", {
      bubbles: true,
      cancelable: true,
    });
    expect(fireEvent(readme, doubleClickEvent)).toBe(false);
    expect(doubleClickEvent.defaultPrevented).toBe(true);
    expect(props.onOpenMarkdown).toHaveBeenCalledOnce();
    expect(props.onOpenMarkdown).toHaveBeenCalledWith(
      expect.objectContaining({ relativePath: "README.md" }),
    );
  });

  it("toggles a directory once from a single disclosure click", async () => {
    const user = userEvent.setup();
    const props = renderTree();
    screen.getByRole("treeitem", { name: "README.md, 현재 문서" }).focus();

    await user.click(screen.getByRole("button", { name: "guide 폴더 접기" }));

    expect(screen.getByRole("treeitem", { name: "guide" })).toHaveFocus();
    expect(props.onToggleDirectory).toHaveBeenCalledOnce();
    expect(props.onToggleDirectory).toHaveBeenCalledWith(
      expect.objectContaining({ relativePath: "guide" }),
    );
    await user.keyboard("{ArrowDown}");
    expect(screen.getByRole("treeitem", { name: "start.md" })).toHaveFocus();
  });

  it("does not toggle a disclosure twice on a double click", async () => {
    const user = userEvent.setup();
    const props = renderTree();

    await user.dblClick(
      screen.getByRole("button", { name: "guide 폴더 접기" }),
    );

    expect(props.onToggleDirectory).toHaveBeenCalledOnce();
  });

  it("supports arrow navigation, expansion, and explicit Enter activation", async () => {
    const user = userEvent.setup();
    const props = renderTree();
    const guide = screen.getByRole("treeitem", { name: "guide" });
    guide.focus();

    await user.keyboard("{ArrowDown}");
    expect(screen.getByRole("treeitem", { name: "start.md" })).toHaveFocus();
    await user.keyboard("{Enter}");
    expect(props.onOpenMarkdown).toHaveBeenCalledWith(
      expect.objectContaining({ relativePath: "guide/start.md" }),
    );

    guide.focus();
    await user.keyboard("{ArrowLeft}");
    expect(props.onToggleDirectory).toHaveBeenCalledWith(
      expect.objectContaining({ relativePath: "guide" }),
    );
  });

  it("keeps focused long names visible in both scroll directions", async () => {
    const scrollIntoView = vi.spyOn(HTMLElement.prototype, "scrollIntoView");
    const user = userEvent.setup();
    renderTree();
    const guide = screen.getByRole("treeitem", { name: "guide" });
    guide.focus();

    await user.keyboard("{ArrowDown}");

    expect(scrollIntoView).toHaveBeenLastCalledWith({
      block: "nearest",
      inline: "nearest",
    });
    expect(document.querySelector(".folder-tree-viewport")).toBeInTheDocument();
    scrollIntoView.mockRestore();
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

  it("opens the native context menu with file removal", () => {
    const props = renderTree();
    const readme = screen.getByRole("treeitem", {
      name: "README.md, 현재 문서",
    });

    const contextMenuEvent = new MouseEvent("contextmenu", {
      bubbles: true,
      cancelable: true,
      clientX: 180,
      clientY: 120,
    });
    expect(fireEvent(readme, contextMenuEvent)).toBe(false);
    expect(contextMenuEvent.defaultPrevented).toBe(true);

    expect(showFolderContextMenu).toHaveBeenCalledWith(
      expect.objectContaining({
        entry: expect.objectContaining({ relativePath: "README.md" }),
        x: 180,
        y: 120,
        canRemoveFile: true,
      }),
    );
    const menuOptions = vi.mocked(showFolderContextMenu).mock.calls[0]?.[0];
    menuOptions?.onRemoveFile();

    expect(props.onRemoveFile).toHaveBeenCalledOnce();
    expect(props.onRemoveFile).toHaveBeenCalledWith(
      expect.objectContaining({ relativePath: "README.md" }),
    );
  });

  it("keeps directory context requests native and non-removable", () => {
    renderTree();

    fireEvent.contextMenu(screen.getByRole("treeitem", { name: "guide" }));

    expect(showFolderContextMenu).toHaveBeenCalledWith(
      expect.objectContaining({
        entry: expect.objectContaining({
          relativePath: "guide",
          kind: "directory",
        }),
      }),
    );
  });

  it("opens the native file menu from the keyboard without replacing tree focus", async () => {
    const user = userEvent.setup();
    renderTree();
    const image = screen.getByRole("treeitem", { name: "cover.png" });
    image.focus();

    await user.keyboard("{Shift>}{F10}{/Shift}");
    expect(showFolderContextMenu).toHaveBeenCalledWith(
      expect.objectContaining({
        entry: expect.objectContaining({ relativePath: "cover.png" }),
      }),
    );
    expect(image).toHaveFocus();
  });

  it("retries an expanded directory after a child listing error", async () => {
    const state = treeState();
    state.directories.guide = {
      ...state.directories.guide,
      status: "error",
      error: "권한이 없습니다",
    };
    const user = userEvent.setup();
    const props = renderTree(state);
    const guide = screen.getByRole("treeitem", {
      name: /guide, 읽기 오류: 권한이 없습니다/,
    });

    guide.focus();
    await user.keyboard("{Enter}");

    expect(props.onRetryDirectory).toHaveBeenCalledWith("guide");
    expect(props.onToggleDirectory).not.toHaveBeenCalled();
  });

  it("renders large directories in bounded pages", async () => {
    const state = treeState();
    state.expandedPaths = new Set();
    state.directories[""].entries = Array.from({ length: 301 }, (_, index) => ({
      name: `문서-${index}.md`,
      relativePath: `문서-${index}.md`,
      path: `/docs/문서-${index}.md`,
      kind: "markdown" as const,
    }));
    const user = userEvent.setup();
    renderTree(state);

    expect(screen.getAllByRole("treeitem")).toHaveLength(300);
    await user.click(screen.getByRole("button", { name: "다음" }));
    expect(screen.getAllByRole("treeitem")).toHaveLength(1);
    expect(screen.getByRole("treeitem", { name: "문서-300.md" })).toHaveFocus();

    await user.click(screen.getByRole("button", { name: "이전" }));
    expect(screen.getAllByRole("treeitem")).toHaveLength(300);
    expect(screen.getByRole("treeitem", { name: "문서-0.md" })).toHaveFocus();
  });

  it("moves keyboard focus across a page boundary without growing the DOM", async () => {
    const state = treeState();
    state.expandedPaths = new Set();
    state.selectedPath = "문서-299.md";
    state.directories[""].entries = Array.from({ length: 301 }, (_, index) => ({
      name: `문서-${index}.md`,
      relativePath: `문서-${index}.md`,
      path: `/docs/문서-${index}.md`,
      kind: "markdown" as const,
    }));
    const user = userEvent.setup();
    renderTree(state);

    screen.getByRole("treeitem", { name: "문서-299.md" }).focus();
    await user.keyboard("{ArrowDown}");

    expect(screen.getAllByRole("treeitem")).toHaveLength(1);
    expect(screen.getByRole("treeitem", { name: "문서-300.md" })).toHaveFocus();
  });

  it("opens on the page containing the current document", async () => {
    const state = treeState();
    state.expandedPaths = new Set();
    state.selectedPath = null;
    state.directories[""].entries = Array.from({ length: 301 }, (_, index) => ({
      name: `문서-${index}.md`,
      relativePath: `문서-${index}.md`,
      path: `/docs/문서-${index}.md`,
      kind: "markdown" as const,
    }));
    const props = {
      state,
      currentDocumentPath: "/docs/문서-300.md",
      isDocumentBusy: false,
      onSelect: vi.fn(),
      onToggleDirectory: vi.fn(),
      onRetryDirectory: vi.fn(),
      onOpenMarkdown: vi.fn(),
      onOpenImage: vi.fn(),
      onRemoveFile: vi.fn(),
      removingFilePath: null,
    };
    render(<FolderTree {...props} />);

    expect(
      await screen.findByRole("treeitem", {
        name: "문서-300.md, 현재 문서",
      }),
    ).toBeInTheDocument();
    expect(screen.getAllByRole("treeitem")).toHaveLength(1);
    expect(screen.getByText("2 / 2")).toBeInTheDocument();
  });

  it("restores focus to the nearest item when refresh removes the active page", async () => {
    const entries = Array.from({ length: 301 }, (_, index) => ({
      name: `문서-${index}.md`,
      relativePath: `문서-${index}.md`,
      path: `/docs/문서-${index}.md`,
      kind: "markdown" as const,
    }));
    const state = treeState();
    state.expandedPaths = new Set();
    state.selectedPath = "문서-300.md";
    state.directories[""].entries = entries;
    const props = {
      state,
      currentDocumentPath: null,
      isDocumentBusy: false,
      onSelect: vi.fn(),
      onToggleDirectory: vi.fn(),
      onRetryDirectory: vi.fn(),
      onOpenMarkdown: vi.fn(),
      onOpenImage: vi.fn(),
      onRemoveFile: vi.fn(),
      removingFilePath: null,
    };
    const { rerender } = render(<FolderTree {...props} />);
    const lastItem = await screen.findByRole("treeitem", {
      name: "문서-300.md",
    });
    lastItem.focus();

    const refreshedState = {
      ...state,
      selectedPath: "문서-300.md",
      directories: {
        ...state.directories,
        "": { ...state.directories[""], entries: entries.slice(0, 300) },
      },
    };
    rerender(<FolderTree {...props} state={refreshedState} />);

    expect(
      await screen.findByRole("treeitem", { name: "문서-299.md" }),
    ).toHaveFocus();
    expect(screen.getAllByRole("treeitem")).toHaveLength(300);
    expect(props.onSelect).toHaveBeenLastCalledWith("문서-299.md");
  });

  it("caps expanded branches before rendering pages", () => {
    const state = treeState();
    state.expandedPaths = new Set();
    state.directories[""].entries = Array.from({ length: 6_001 }, (_, index) => ({
      name: `문서-${index}.md`,
      relativePath: `문서-${index}.md`,
      path: `/docs/문서-${index}.md`,
      kind: "markdown" as const,
    }));
    renderTree(state);

    expect(screen.getAllByRole("treeitem")).toHaveLength(300);
    expect(screen.getByText(/처음 6,000개만 표시/)).toBeInTheDocument();
    expect(screen.getByText("1 / 20")).toBeInTheDocument();
  });
});
