import { invoke } from "@tauri-apps/api/core";
import { confirm, message, open } from "@tauri-apps/plugin-dialog";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import App from "./App";
import { setViewportWidth } from "./test/setup";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
  isTauri: () => false,
}));
vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn(async () => () => undefined),
}));
vi.mock("@tauri-apps/plugin-dialog", () => ({
  confirm: vi.fn(),
  message: vi.fn(),
  open: vi.fn(),
}));
vi.mock("./components/SyntaxHighlightedCode", () => ({
  SyntaxHighlightedCode: ({ code }: { code: string }) => <pre>{code}</pre>,
}));

function outlineHeading() {
  return screen.queryByRole("heading", { name: "문서 목차" });
}

describe("workspace regression contracts", () => {
  beforeEach(() => {
    setViewportWidth(1440);
    vi.mocked(invoke).mockReset();
    vi.mocked(confirm).mockReset();
    vi.mocked(message).mockReset();
    vi.mocked(open).mockReset();
    vi.mocked(message).mockResolvedValue("Ok");
  });

  it("keeps an inset outline open while reading settings toggle", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole("button", { name: "문서 목차 열기" }));
    await user.click(screen.getByRole("button", { name: "읽기 설정" }));

    expect(outlineHeading()).toBeInTheDocument();
    expect(screen.getByRole("dialog", { name: "읽기 설정" })).toBeInTheDocument();
  });

  it("keeps an inset outline through notes, search, and preview focus", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole("button", { name: "문서 목차 열기" }));
    await user.click(screen.getByRole("button", { name: "메모" }));
    expect(outlineHeading()).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "메모 검색" }));
    expect(outlineHeading()).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "미리보기 집중 모드" }));
    expect(outlineHeading()).toBeInTheDocument();
  });

  it("dismisses recent documents when a document action begins", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole("button", { name: "최근 문서 열기" }));
    expect(screen.getByRole("heading", { name: "최근 문서" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "메모" }));
    expect(screen.queryByRole("heading", { name: "최근 문서" })).not.toBeInTheDocument();
  });

  it("keeps modal sidebar and settings mutually exclusive", async () => {
    setViewportWidth(1200);
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole("button", { name: "문서 목차 열기" }));
    expect(outlineHeading()).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "읽기 설정" }));

    expect(outlineHeading()).not.toBeInTheDocument();
    expect(screen.getByRole("dialog", { name: "읽기 설정" })).toBeInTheDocument();
  });

  it("closes search, preview focus, and inset outline in layer order", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole("button", { name: "문서 목차 열기" }));
    await user.click(screen.getByRole("button", { name: "미리보기 집중 모드" }));
    await user.click(screen.getByRole("button", { name: "미리보기 검색" }));

    expect(screen.getByRole("search", { name: "미리보기 검색" })).toBeInTheDocument();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("search", { name: "미리보기 검색" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "미리보기 집중 모드 종료" })).toBeInTheDocument();

    await user.keyboard("{Escape}");
    expect(screen.getByRole("button", { name: "미리보기 집중 모드" })).toBeInTheDocument();
    expect(outlineHeading()).toBeInTheDocument();

    const outline = document.querySelector("#document-outline");
    const outlineCloseButton = Array.from(
      screen.getAllByRole("button", { name: "문서 목차 닫기" }),
    ).find((button) => outline?.contains(button));
    outlineCloseButton?.focus();
    await user.keyboard("{Escape}");
    expect(outlineHeading()).not.toBeInTheDocument();
  });

  it("preserves edited Markdown when document switching is cancelled", async () => {
    vi.mocked(open).mockResolvedValue("/docs/next.md");
    vi.mocked(confirm).mockResolvedValue(false);
    vi.mocked(invoke).mockImplementation(async (command) => {
      if (command === "read_markdown_file") {
        return {
          path: "/docs/next.md",
          name: "next.md",
          content: "# 다음 문서",
          revision: "next-revision",
        };
      }
      return { kind: "available", revision: "next-revision" };
    });
    const user = userEvent.setup();
    render(<App />);
    const editor = screen.getByRole("textbox", { name: "마크다운 입력" });

    await user.clear(editor);
    await user.type(editor, "# 현재 변경");
    await user.click(screen.getByRole("button", { name: "Markdown 파일 열기" }));

    await waitFor(() => expect(confirm).toHaveBeenCalledOnce());
    expect(editor).toHaveValue("# 현재 변경");
    expect(screen.getByText("새 문서.md")).toBeInTheDocument();
  });

  it("blocks a second open operation while the file picker is pending", async () => {
    let resolveOpen: (value: string | null) => void = () => undefined;
    vi.mocked(open).mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveOpen = resolve;
        }),
    );
    const user = userEvent.setup();
    render(<App />);
    const openButton = screen.getByRole("button", { name: "Markdown 파일 열기" });

    await user.click(openButton);
    expect(openButton).toBeDisabled();
    expect(open).toHaveBeenCalledOnce();

    resolveOpen(null);
    await waitFor(() => expect(openButton).toBeEnabled());
  });

  it("keeps the current document when a Tauri read fails", async () => {
    vi.mocked(open).mockResolvedValue("/docs/broken.md");
    vi.mocked(invoke).mockRejectedValue(new Error("읽기 실패"));
    const user = userEvent.setup();
    render(<App />);
    const editor = screen.getByRole("textbox", { name: "마크다운 입력" });
    const originalValue = (editor as HTMLTextAreaElement).value;

    await user.click(screen.getByRole("button", { name: "Markdown 파일 열기" }));

    await waitFor(() => expect(message).toHaveBeenCalledWith("읽기 실패", {
      title: "파일을 열 수 없습니다",
      kind: "error",
    }));
    expect(editor).toHaveValue(originalValue);
    expect(screen.getByText("새 문서.md")).toBeInTheDocument();
  });
});
