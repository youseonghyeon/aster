import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ReadingSettings } from "./ReadingSettings";

describe("reading settings", () => {
  it("reports theme, font, and line spacing selections", async () => {
    const user = userEvent.setup();
    const onThemeChange = vi.fn();
    const onReadingFontChange = vi.fn();
    const onLineSpacingChange = vi.fn();
    const onMermaidCurveChange = vi.fn();

    const { rerender } = render(
      <ReadingSettings
        theme="paper"
        readingFont="pretendard"
        lineSpacing="balanced"
        mermaidCurve="curved"
        onThemeChange={onThemeChange}
        onReadingFontChange={onReadingFontChange}
        onLineSpacingChange={onLineSpacingChange}
        onMermaidCurveChange={onMermaidCurveChange}
      />,
    );

    await user.click(screen.getByRole("button", { name: "야간" }));
    await user.click(screen.getByRole("button", { name: "글꼴" }));
    await user.click(screen.getByRole("option", { name: "Noto Serif KR" }));
    await user.click(screen.getByRole("button", { name: "여유 1.9" }));
    await user.click(screen.getByRole("button", { name: "직각" }));

    expect(onThemeChange).toHaveBeenCalledWith("night");
    expect(onReadingFontChange).toHaveBeenCalledWith("noto-serif");
    expect(onLineSpacingChange).toHaveBeenCalledWith("relaxed");
    expect(onMermaidCurveChange).toHaveBeenCalledWith("orthogonal");
    rerender(
      <ReadingSettings
        theme="paper"
        readingFont="pretendard"
        lineSpacing="balanced"
        mermaidCurve="orthogonal"
        onThemeChange={onThemeChange}
        onReadingFontChange={onReadingFontChange}
        onLineSpacingChange={onLineSpacingChange}
        onMermaidCurveChange={onMermaidCurveChange}
      />,
    );

    expect(screen.getByRole("button", { name: "직각" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByRole("button", { name: "곡선" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
    expect(screen.getByRole("button", { name: "직선" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );

    const straightButton = screen.getByRole("button", { name: "직선" });
    straightButton.focus();
    await user.keyboard("{Enter}");
    expect(straightButton).toHaveFocus();
    expect(onMermaidCurveChange).toHaveBeenLastCalledWith("straight");
    const callsAfterEnter = onMermaidCurveChange.mock.calls.length;
    await user.keyboard(" ");
    expect(straightButton).toHaveFocus();
    expect(onMermaidCurveChange).toHaveBeenCalledTimes(callsAfterEnter + 1);
    expect(onMermaidCurveChange).toHaveBeenLastCalledWith("straight");
  });

  it("explains the Mermaid curve scope with an accessible disclosure", async () => {
    const user = userEvent.setup();
    render(
      <ReadingSettings
        theme="paper"
        readingFont="pretendard"
        lineSpacing="balanced"
        mermaidCurve="curved"
        onThemeChange={vi.fn()}
        onReadingFontChange={vi.fn()}
        onLineSpacingChange={vi.fn()}
        onMermaidCurveChange={vi.fn()}
      />,
    );

    const helpButton = screen.getByRole("button", {
      name: "다이어그램 선 도움말",
    });
    const fontButton = screen.getByRole("button", { name: "글꼴" });
    const curvedButton = screen.getByRole("button", { name: "곡선" });

    expect(helpButton).toHaveAttribute("aria-expanded", "false");
    expect(helpButton).toHaveAttribute(
      "aria-controls",
      "mermaid-curve-help-note",
    );
    expect(screen.queryByRole("note")).not.toBeInTheDocument();

    await user.click(helpButton);
    expect(helpButton).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("note")).toHaveTextContent(
      "Flowchart 계열(Flowchart·Swimlanes)의 연결선에 적용됩니다.",
    );
    expect(screen.getByRole("note")).toHaveTextContent(
      "Sequence·ER처럼 자체 선 형식을 사용하는 다이어그램은 바뀌지 않습니다.",
    );

    await user.tab();
    expect(curvedButton).toHaveFocus();
    await user.keyboard("{Escape}");
    expect(helpButton).toHaveAttribute("aria-expanded", "false");
    expect(helpButton).toHaveFocus();

    await user.keyboard("{Enter}");
    expect(helpButton).toHaveAttribute("aria-expanded", "true");
    await user.click(curvedButton);
    expect(helpButton).toHaveAttribute("aria-expanded", "false");

    helpButton.focus();
    await user.keyboard(" ");
    expect(helpButton).toHaveAttribute("aria-expanded", "true");

    fontButton.focus();
    await user.keyboard("{ArrowDown}");
    expect(screen.getByRole("listbox", { name: "글꼴 선택" })).toBeInTheDocument();
    await user.keyboard("{Escape}");
    expect(
      screen.queryByRole("listbox", { name: "글꼴 선택" }),
    ).not.toBeInTheDocument();
    expect(helpButton).toHaveAttribute("aria-expanded", "true");
    expect(fontButton).toHaveFocus();

    await user.keyboard("{Escape}");
    expect(helpButton).toHaveAttribute("aria-expanded", "false");
    expect(helpButton).toHaveFocus();
    await user.keyboard(" ");
    expect(helpButton).toHaveAttribute("aria-expanded", "true");
    await user.click(document.body);
    expect(helpButton).toHaveAttribute("aria-expanded", "false");
  });
});
