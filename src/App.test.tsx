import { invoke } from "@tauri-apps/api/core";
import { confirm, message, open } from "@tauri-apps/plugin-dialog";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
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
vi.mock("./hooks/useTextSearch", async () => {
  const { findTextMatches } = await import("./lib/text-search");
  const { useMemo } = await import("react");

  return {
    useTextSearch: (
      value: string,
      query: string,
      options: { isCaseSensitive: boolean; isRegex: boolean },
    ) =>
      useMemo(
        () => findTextMatches(value, query, options),
        [options.isCaseSensitive, options.isRegex, query, value],
      ),
  };
});

function outlineHeading() {
  return screen.queryByRole("heading", { name: "문서 목차" });
}

function nextAnimationFrame() {
  return new Promise<void>((resolve) => {
    window.requestAnimationFrame(() => resolve());
  });
}

async function flushSearchFrames() {
  await nextAnimationFrame();
  await nextAnimationFrame();
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

  it("keeps the Markdown search input focused while Enter navigates results", async () => {
    const user = userEvent.setup();
    render(<App />);
    const editor = screen.getByRole("textbox", { name: "마크다운 입력" });

    await user.click(screen.getByRole("button", { name: "마크다운 검색" }));
    const searchInput = screen.getByRole("searchbox", {
      name: "마크다운에서 검색",
    });
    await user.type(searchInput, "문서");
    await flushSearchFrames();

    const editorFocusListener = vi.fn();
    editor.addEventListener("focus", editorFocusListener);
    await user.keyboard("{Enter}");
    await flushSearchFrames();

    expect(editorFocusListener).not.toHaveBeenCalled();
    expect(searchInput).toHaveFocus();
  });

  it("highlights Markdown matches and advances the current result", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole("button", { name: "마크다운 검색" }));
    const searchInput = screen.getByRole("searchbox", {
      name: "마크다운에서 검색",
    });
    await user.type(searchInput, "마크다운");
    await flushSearchFrames();

    const layer = document.querySelector(
      "[data-source-search-highlights='editor']",
    );
    expect(layer).not.toBeNull();
    const matches = Array.from(
      layer?.querySelectorAll<HTMLElement>("[data-source-search-match]") ?? [],
    );
    expect(matches.length).toBeGreaterThan(1);
    const initialCurrent = layer?.querySelector(".is-current");
    expect(initialCurrent).toBe(matches[0]);
    const editor = screen.getByRole<HTMLTextAreaElement>("textbox", {
      name: "마크다운 입력",
    });
    editor.scrollTop = 48;
    editor.scrollLeft = 7;
    fireEvent.scroll(editor);
    await flushSearchFrames();
    expect(
      layer?.querySelector<HTMLElement>(".source-search-highlights-content"),
    ).toHaveStyle({ transform: "translate3d(-7px, -48px, 0)" });

    await user.keyboard("{Enter}");
    await flushSearchFrames();

    expect(layer?.querySelector(".is-current")).toBe(matches[1]);
    expect(searchInput).toHaveFocus();
  });

  it("highlights note matches without moving focus from note search", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole("button", { name: "메모" }));
    const noteEditor = screen.getByRole("textbox", {
      name: "이 문서에 대한 개인 메모",
    });
    await user.type(noteEditor, "메모 사이 메모");
    await user.click(screen.getByRole("button", { name: "메모 검색" }));
    const searchInput = screen.getByRole("searchbox", {
      name: "메모에서 검색",
    });
    await user.type(searchInput, "메모");
    await flushSearchFrames();

    const layer = document.querySelector(
      "[data-source-search-highlights='notes']",
    );
    const matches = layer?.querySelectorAll("[data-source-search-match]");
    expect(matches).toHaveLength(2);
    expect(layer?.querySelectorAll(".is-current")).toHaveLength(1);

    const noteFocusListener = vi.fn();
    noteEditor.addEventListener("focus", noteFocusListener);
    await user.keyboard("{Enter}");
    await flushSearchFrames();

    expect(noteFocusListener).not.toHaveBeenCalled();
    expect(searchInput).toHaveFocus();
  });

  it("keeps the current Markdown result position when Escape closes search", async () => {
    const user = userEvent.setup();
    render(<App />);
    const editor = screen.getByRole<HTMLTextAreaElement>("textbox", {
      name: "마크다운 입력",
    });
    editor.scrollTop = 120;

    await user.click(screen.getByRole("button", { name: "마크다운 검색" }));
    const searchInput = screen.getByRole("searchbox", {
      name: "마크다운에서 검색",
    });
    await user.type(searchInput, "문서");
    await flushSearchFrames();
    editor.scrollTop = 720;
    const selection = {
      start: editor.selectionStart,
      end: editor.selectionEnd,
    };

    await user.keyboard("{Escape}");
    await flushSearchFrames();

    expect(
      screen.queryByRole("search", { name: "마크다운 검색" }),
    ).not.toBeInTheDocument();
    expect(editor.scrollTop).toBe(720);
    expect(editor.selectionStart).toBe(selection.start);
    expect(editor.selectionEnd).toBe(selection.end);
    expect(
      screen.getByRole("textbox", { name: "마크다운 입력" }),
    ).toBe(editor);
    expect(
      document.querySelector("[data-source-search-highlights='editor']"),
    ).toBeNull();
  });

  it("restores the pre-search note position when Escape closes search", async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole("button", { name: "메모" }));
    await flushSearchFrames();
    const noteEditor = screen.getByRole<HTMLTextAreaElement>("textbox", {
      name: "이 문서에 대한 개인 메모",
    });
    await user.type(noteEditor, "메모 사이 메모");
    noteEditor.setSelectionRange(1, 3, "forward");
    noteEditor.scrollTop = 125;

    await user.click(screen.getByRole("button", { name: "메모 검색" }));
    await user.type(
      screen.getByRole("searchbox", { name: "메모에서 검색" }),
      "메모",
    );
    await flushSearchFrames();
    noteEditor.scrollTop = 640;
    await user.keyboard("{Escape}");
    await flushSearchFrames();

    expect(noteEditor.scrollTop).toBe(125);
    expect(noteEditor.selectionStart).toBe(1);
    expect(noteEditor.selectionEnd).toBe(3);
    expect(
      screen.getByRole("textbox", { name: "이 문서에 대한 개인 메모" }),
    ).toBe(noteEditor);
    expect(
      document.querySelector("[data-source-search-highlights='notes']"),
    ).toBeNull();
  });

  it("still restores the pre-search Markdown position after preview focus mode", async () => {
    const user = userEvent.setup();
    render(<App />);
    await flushSearchFrames();
    const editor = screen.getByRole<HTMLTextAreaElement>("textbox", {
      name: "마크다운 입력",
    });
    editor.setSelectionRange(2, 7, "forward");
    editor.scrollTop = 135;

    await user.click(screen.getByRole("button", { name: "마크다운 검색" }));
    await user.type(
      screen.getByRole("searchbox", { name: "마크다운에서 검색" }),
      "문서",
    );
    await flushSearchFrames();
    editor.scrollTop = 720;

    await user.click(screen.getByRole("button", { name: "미리보기 집중 모드" }));
    await user.click(
      screen.getByRole("button", { name: "미리보기 집중 모드 종료" }),
    );
    await flushSearchFrames();

    expect(editor.scrollTop).toBe(135);
    expect(editor.selectionStart).toBe(2);
    expect(editor.selectionEnd).toBe(7);
  });

  it("still restores the pre-search note position after preview focus mode", async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole("button", { name: "메모" }));
    await flushSearchFrames();
    const noteEditor = screen.getByRole<HTMLTextAreaElement>("textbox", {
      name: "이 문서에 대한 개인 메모",
    });
    await user.type(noteEditor, "메모 사이 메모");
    noteEditor.setSelectionRange(1, 3, "forward");
    noteEditor.scrollTop = 145;

    await user.click(screen.getByRole("button", { name: "메모 검색" }));
    await user.type(
      screen.getByRole("searchbox", { name: "메모에서 검색" }),
      "메모",
    );
    await flushSearchFrames();
    noteEditor.scrollTop = 680;

    await user.click(screen.getByRole("button", { name: "미리보기 집중 모드" }));
    await user.click(
      screen.getByRole("button", { name: "미리보기 집중 모드 종료" }),
    );
    await flushSearchFrames();

    expect(noteEditor.scrollTop).toBe(145);
    expect(noteEditor.selectionStart).toBe(1);
    expect(noteEditor.selectionEnd).toBe(3);
  });

  it("keeps the current preview result position when Escape closes search", async () => {
    const user = userEvent.setup();
    render(<App />);
    const preview = screen.getByLabelText<HTMLDivElement>("미리보기 내용");
    const nested = preview.querySelector<HTMLElement>(
      ".markdown-body pre, .markdown-body .table-scroll",
    );
    expect(nested).not.toBeNull();
    if (!nested) {
      throw new Error("미리보기 중첩 스크롤 요소가 필요합니다");
    }
    preview.scrollTop = 85;
    preview.scrollLeft = 12;
    nested.scrollTop = 9;
    nested.scrollLeft = 34;

    await user.click(screen.getByRole("button", { name: "미리보기 검색" }));
    preview.scrollTop = 710;
    preview.scrollLeft = 220;
    nested.scrollTop = 410;
    nested.scrollLeft = 330;
    await user.keyboard("{Escape}");
    await flushSearchFrames();

    expect(preview.scrollTop).toBe(710);
    expect(preview.scrollLeft).toBe(220);
    expect(nested.scrollTop).toBe(410);
    expect(nested.scrollLeft).toBe(330);
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
