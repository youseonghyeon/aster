import { act, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MermaidDiagram, readMermaidThemeTokens } from "./MermaidDiagram";

const { renderMermaidDiagram } = vi.hoisted(() => ({
  renderMermaidDiagram: vi.fn(),
}));

vi.mock("../lib/mermaid-renderer", () => ({
  renderMermaidDiagram,
}));

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

describe("MermaidDiagram", () => {
  beforeEach(() => {
    renderMermaidDiagram.mockReset();
  });

  it("reads the current Aster theme tokens", () => {
    const shell = document.createElement("div");
    shell.className = "app-shell";
    shell.style.setProperty("--preview-background", "#101010");
    shell.style.setProperty("--text-body", "#eeeeee");
    shell.style.setProperty("--accent", "#abcdef");
    shell.style.setProperty("--reading-font", "Aster Test");
    shell.style.setProperty("--reading-font-size", "19px");
    shell.style.colorScheme = "dark";
    const child = document.createElement("div");
    shell.append(child);
    document.body.append(shell);

    expect(readMermaidThemeTokens(child)).toMatchObject({
      background: "#101010",
      text: "#eeeeee",
      accent: "#abcdef",
      fontFamily: "Aster Test",
      fontSize: "19px",
      darkMode: true,
    });
    shell.remove();
  });

  it("shows a rendered SVG in an accessible, intrinsically sized region", async () => {
    renderMermaidDiagram.mockResolvedValueOnce(
      '<svg viewBox="0 0 920.2 410.1"><title>읽기 흐름</title><text>완료</text></svg>',
    );
    render(
      <MermaidDiagram
        source="flowchart LR\nA --> B"
        sourceOffset={12}
        appearanceKey="paper"
      />,
    );

    const region = screen.getByRole("region", { name: "Mermaid 다이어그램" });
    expect(region).toHaveAttribute("aria-busy", "true");
    await screen.findByText("완료");

    const svg = region.querySelector("svg");
    expect(region).toHaveAttribute("aria-busy", "false");
    expect(region).toHaveAttribute(
      "aria-label",
      "Mermaid 다이어그램: 읽기 흐름",
    );
    expect(region).toHaveAttribute("data-source-offset", "12");
    expect(svg).toHaveStyle({ width: "921px", height: "411px" });
    expect(svg).toHaveAttribute("focusable", "false");
  });

  it("keeps the previous SVG and scroll position while appearance rerenders", async () => {
    const second = deferred<string>();
    renderMermaidDiagram
      .mockResolvedValueOnce('<svg viewBox="0 0 900 400"><text>이전</text></svg>')
      .mockReturnValueOnce(second.promise);
    const { rerender } = render(
      <MermaidDiagram
        source="flowchart LR\nA --> B"
        appearanceKey="paper"
      />,
    );
    await screen.findByText("이전");
    const region = screen.getByRole<HTMLElement>("region", {
      name: "Mermaid 다이어그램",
    });
    region.scrollTop = 37;
    region.scrollLeft = 81;

    rerender(
      <MermaidDiagram
        source="flowchart LR\nA --> B"
        appearanceKey="night"
      />,
    );
    await waitFor(() => expect(region).toHaveAttribute("aria-busy", "true"));
    expect(
      screen.getByRole("region", { name: "Mermaid 다이어그램" }),
    ).toBe(region);
    expect(screen.getByText("이전")).toBeInTheDocument();

    await act(async () => {
      second.resolve('<svg viewBox="0 0 1000 500"><text>새 테마</text></svg>');
      await second.promise;
    });
    await screen.findByText("새 테마");
    expect(
      screen.getByRole("region", { name: "Mermaid 다이어그램" }),
    ).toBe(region);
    expect(region.scrollTop).toBe(37);
    expect(region.scrollLeft).toBe(81);
  });

  it("discards a stale result after the source changes", async () => {
    const first = deferred<string>();
    const second = deferred<string>();
    renderMermaidDiagram
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise);
    const { rerender } = render(
      <MermaidDiagram source="old" appearanceKey="paper" />,
    );
    await waitFor(() => expect(renderMermaidDiagram).toHaveBeenCalledTimes(1));
    rerender(<MermaidDiagram source="new" appearanceKey="paper" />);
    await waitFor(() => expect(renderMermaidDiagram).toHaveBeenCalledTimes(2));

    await act(async () => {
      second.resolve('<svg viewBox="0 0 100 80"><text>최신</text></svg>');
      await second.promise;
    });
    await screen.findByText("최신");
    await act(async () => {
      first.resolve('<svg viewBox="0 0 100 80"><text>이전 결과</text></svg>');
      await first.promise;
    });
    expect(screen.queryByText("이전 결과")).not.toBeInTheDocument();
    expect(screen.getByText("최신")).toBeInTheDocument();
  });

  it("shows the original source with actionable guidance after an error", async () => {
    renderMermaidDiagram.mockRejectedValueOnce(new Error("parse failed"));
    render(<MermaidDiagram source="not a diagram" appearanceKey="paper" />);

    expect(
      await screen.findByText(
        "다이어그램을 표시하지 못했습니다. 아래 Mermaid 문법을 확인하세요.",
      ),
    ).toHaveAttribute("role", "status");
    expect(
      screen.getByText(
        "다이어그램을 표시하지 못했습니다. 아래 Mermaid 문법을 확인하세요.",
      ),
    ).toHaveAttribute("aria-atomic", "true");
    expect(screen.getByText("not a diagram")).toBeInTheDocument();
  });
});
