import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { FolderTreeState } from "./folder-tree-state";
import { FolderBrowser } from "./FolderBrowser";

function browserState(): FolderTreeState {
  return {
    root: { token: 1, path: "/docs", name: "docs" },
    rootStatus: "ready",
    rootRequestId: 1,
    rootError: null,
    expandedPaths: new Set(),
    selectedPath: "README.md",
    directories: {
      "": {
        status: "loaded",
        requestId: 1,
        truncated: false,
        error: null,
        entries: [
          {
            name: "README.md",
            relativePath: "README.md",
            path: "/docs/README.md",
            kind: "markdown",
          },
        ],
      },
    },
  };
}

function browserProps(state: FolderTreeState) {
  return {
    state,
    currentDocumentPath: "/docs/README.md",
    isModal: true,
    isDocumentBusy: false,
    isPersistenceLimited: false,
    operationError: null,
    onClose: vi.fn(),
    onRecentView: vi.fn(),
    onChooseRoot: vi.fn(),
    onClearRoot: vi.fn(),
    onRefresh: vi.fn(),
    onSelectEntry: vi.fn(),
    onToggleDirectory: vi.fn(),
    onRetryDirectory: vi.fn(),
    onOpenMarkdown: vi.fn(),
    onOpenImage: vi.fn(),
  };
}

describe("FolderBrowser", () => {
  it("moves focus to folder change when a refresh removes the entire tree", async () => {
    const state = browserState();
    const props = browserProps(state);
    const { rerender } = render(<FolderBrowser {...props} />);
    expect(
      await screen.findByRole("treeitem", { name: "README.md, 현재 문서" }),
    ).toHaveFocus();
    expect(screen.getByRole("tabpanel")).toHaveClass("has-visible-tree");

    const emptyState = {
      ...state,
      selectedPath: null,
      directories: {
        "": { ...state.directories[""], entries: [] },
      },
    };
    rerender(<FolderBrowser {...props} state={emptyState} />);

    expect(screen.getByRole("button", { name: "폴더 변경" })).toHaveFocus();
    expect(
      screen.queryByRole("button", { name: "새로고침" }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("tabpanel")).not.toHaveClass("has-visible-tree");
    expect(screen.getByText("표시할 파일이 없습니다")).toBeInTheDocument();
  });

  it("keeps an explicit retry when the root listing has no cache", async () => {
    const user = userEvent.setup();
    const state = browserState();
    const errorState = {
      ...state,
      selectedPath: null,
      directories: {
        "": {
          ...state.directories[""],
          status: "error" as const,
          error: "권한이 없습니다",
          entries: [],
        },
      },
    };
    const props = browserProps(errorState);

    render(<FolderBrowser {...props} />);
    expect(
      screen.queryByRole("button", { name: "새로고침" }),
    ).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "다시 시도" }));

    expect(props.onRefresh).toHaveBeenCalledOnce();
  });

  it("keeps cached tree focus when a refresh fails", async () => {
    const state = browserState();
    const props = browserProps(state);
    const { rerender } = render(<FolderBrowser {...props} />);
    const readme = await screen.findByRole("treeitem", {
      name: "README.md, 현재 문서",
    });
    expect(readme).toHaveFocus();

    const errorState = {
      ...state,
      directories: {
        "": {
          ...state.directories[""],
          status: "error" as const,
          error: "권한이 없습니다",
        },
      },
    };
    rerender(<FolderBrowser {...props} state={errorState} />);

    expect(readme).toHaveFocus();
    const panel = screen.getByRole("tabpanel");
    const alert = screen.getByRole("alert");
    expect(panel).toHaveClass("has-visible-tree");
    expect(panel.lastElementChild).toBe(alert);
    expect(alert).toHaveTextContent(
      "파일 목록을 새로고침하지 못했습니다: 권한이 없습니다. 잠시 후 자동으로 다시 시도합니다.",
    );
  });
});
