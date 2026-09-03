import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AppHeader, type AppHeaderProps } from "./AppHeader";

function renderHeader(options: Partial<AppHeaderProps>) {
  const props: AppHeaderProps = {
    documentName: "guide.md",
    documentPath: "/docs/guide.md",
    saveStatus: "saved",
    recovered: false,
    isDocumentBrowserOpen: false,
    isOutlineOpen: false,
    isBusy: false,
    canGoBack: false,
    canGoForward: false,
    isSettingsOpen: false,
    documentBrowserButtonRef: null,
    outlineButtonRef: null,
    settingsRef: null,
    settingsButtonRef: null,
    onDocumentBrowserToggle: vi.fn(),
    onOutlineToggle: vi.fn(),
    onOpenFile: vi.fn(),
    onGoBack: vi.fn(),
    onGoForward: vi.fn(),
    onSettingsToggle: vi.fn(),
    settings: null,
    ...options,
  };
  render(<AppHeader {...props} />);
  return screen.getByRole("status");
}

describe("AppHeader document status", () => {
  it("marks non-interactive title bar surfaces as native drag regions", () => {
    renderHeader({});

    expect(screen.getByRole("banner")).toHaveAttribute("data-tauri-drag-region");
    expect(screen.getByText("guide.md")).toHaveAttribute("data-tauri-drag-region");
    expect(screen.getByRole("status")).toHaveAttribute("data-tauri-drag-region");

    for (const button of screen.getAllByRole("button")) {
      expect(button).not.toHaveAttribute("data-tauri-drag-region");
    }
  });

  it.each([
    [{ saveStatus: "saved" as const }, "저장됨"],
    [{ documentPath: null, saveStatus: "saved" as const }, "새 문서"],
    [{ saveStatus: "saving" as const }, "저장 중…"],
    [{ saveStatus: "modified" as const }, "저장되지 않음"],
    [{ saveStatus: "conflict" as const }, "원본 변경 충돌"],
    [{ saveStatus: "error" as const }, "저장 오류"],
    [
      { saveStatus: "modified" as const, recovered: true },
      "복구됨 · 저장되지 않음",
    ],
    [
      { saveStatus: "conflict" as const, recovered: true },
      "복구됨 · 원본 변경",
    ],
  ])("shows %s as an announced status", (options, label) => {
    const status = renderHeader(options);
    expect(status).toHaveTextContent(label);
    expect(status).toHaveAttribute("aria-live", "polite");
  });

  it("does not expose a redundant header save action", () => {
    renderHeader({ saveStatus: "modified" });

    expect(
      screen.queryByRole("button", { name: "Markdown 저장" }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("저장되지 않음");
  });

  it("exposes disabled history controls until navigation is available", () => {
    renderHeader({});

    expect(screen.getByRole("button", { name: "뒤로 이동" })).toMatchObject({
      disabled: true,
      title: "뒤로 이동할 기록 없음",
    });
    expect(screen.getByRole("button", { name: "뒤로 이동" })).toHaveAttribute(
      "data-disabled-reason",
      "empty",
    );
    expect(screen.getByRole("button", { name: "앞으로 이동" })).toMatchObject({
      disabled: true,
      title: "앞으로 이동할 기록 없음",
    });
    expect(screen.getByRole("button", { name: "앞으로 이동" })).toHaveAttribute(
      "data-disabled-reason",
      "empty",
    );
  });

  it("distinguishes busy history controls from an empty history", () => {
    renderHeader({ isBusy: true, canGoBack: true, canGoForward: true });

    expect(screen.getByRole("button", { name: "뒤로 이동" })).toHaveAttribute(
      "title",
      "문서를 처리하는 동안 뒤로 이동할 수 없습니다",
    );
    expect(screen.getByRole("button", { name: "앞으로 이동" })).toHaveAttribute(
      "title",
      "문서를 처리하는 동안 앞으로 이동할 수 없습니다",
    );
    expect(screen.getByRole("button", { name: "뒤로 이동" })).toHaveAttribute(
      "data-disabled-reason",
      "busy",
    );
  });
});
