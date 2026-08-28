import { render, screen } from "@testing-library/react";
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
  beforeEach(() => setViewportWidth(1440));

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
});
