import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ReadingSettings } from "./ReadingSettings";

describe("reading settings", () => {
  it("reports theme, font, font size, and line spacing selections", async () => {
    const user = userEvent.setup();
    const onThemeChange = vi.fn();
    const onReadingFontChange = vi.fn();
    const onReadingFontSizeChange = vi.fn();
    const onLineSpacingChange = vi.fn();
    const onMermaidCurveChange = vi.fn();

    const { rerender } = render(
      <ReadingSettings
        theme="paper"
        readingFont="pretendard"
        readingFontSize="17"
        lineSpacing="balanced"
        mermaidCurve="curved"
        onThemeChange={onThemeChange}
        onReadingFontChange={onReadingFontChange}
        onReadingFontSizeChange={onReadingFontSizeChange}
        onLineSpacingChange={onLineSpacingChange}
        onMermaidCurveChange={onMermaidCurveChange}
      />,
    );

    await user.click(screen.getByRole("button", { name: "야간" }));
    await user.click(screen.getByRole("button", { name: "글꼴" }));
    expect(
      screen.getAllByRole("option").map((option) => option.textContent),
    ).toEqual([
      "Pretendard",
      "Noto Sans KR",
      "고운바탕",
      "Noto Serif KR",
      "시스템 고딕",
      "Literata",
      "EB Garamond",
      "Dancing Script",
    ]);
    await user.click(screen.getByRole("option", { name: "Dancing Script" }));
    await user.click(screen.getByRole("button", { name: "아주 크게 21px" }));
    await user.click(screen.getByRole("button", { name: "여유 1.9" }));
    await user.click(screen.getByRole("button", { name: "직각" }));

    expect(onThemeChange).toHaveBeenCalledWith("night");
    expect(onReadingFontChange).toHaveBeenCalledWith("dancing-script");
    expect(onReadingFontSizeChange).toHaveBeenCalledWith("21");
    expect(onLineSpacingChange).toHaveBeenCalledWith("relaxed");
    expect(onMermaidCurveChange).toHaveBeenCalledWith("orthogonal");
    rerender(
      <ReadingSettings
        theme="paper"
        readingFont="pretendard"
        readingFontSize="21"
        lineSpacing="balanced"
        mermaidCurve="orthogonal"
        onThemeChange={onThemeChange}
        onReadingFontChange={onReadingFontChange}
        onReadingFontSizeChange={onReadingFontSizeChange}
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
    expect(
      screen.getByRole("button", { name: "아주 크게 21px" }),
    ).toHaveAttribute("aria-pressed", "true");

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

  it("exposes diagram help as a hover and focus tooltip", async () => {
    const user = userEvent.setup();
    render(
      <ReadingSettings
        theme="paper"
        readingFont="pretendard"
        readingFontSize="17"
        lineSpacing="balanced"
        mermaidCurve="curved"
        onThemeChange={vi.fn()}
        onReadingFontChange={vi.fn()}
        onReadingFontSizeChange={vi.fn()}
        onLineSpacingChange={vi.fn()}
        onMermaidCurveChange={vi.fn()}
      />,
    );

    const helpButton = screen.getByRole("button", {
      name: "다이어그램 선 도움말",
    });
    const tooltip = screen.getByRole("tooltip");
    const curvedButton = screen.getByRole("button", { name: "곡선" });

    expect(helpButton).toHaveAttribute(
      "aria-describedby",
      "mermaid-curve-help-tooltip",
    );
    expect(helpButton).not.toHaveAttribute("aria-expanded");
    expect(helpButton).not.toHaveAttribute("aria-controls");
    expect(helpButton).not.toHaveAttribute("title");
    expect(tooltip).toHaveTextContent(
      "연결선 모양은 순서도 계열에만 적용됩니다.",
    );

    await user.hover(helpButton);
    expect(helpButton).toHaveAttribute("data-tooltip-visible", "true");

    await user.keyboard("{Escape}");
    expect(helpButton).not.toHaveAttribute("data-tooltip-visible");

    helpButton.focus();
    expect(helpButton).not.toHaveAttribute("data-tooltip-visible");
    expect(helpButton).toHaveFocus();

    curvedButton.focus();
    expect(helpButton).not.toHaveAttribute("data-tooltip-visible");

    await user.unhover(helpButton);
    await user.hover(helpButton);
    expect(helpButton).toHaveAttribute("data-tooltip-visible", "true");

    await user.unhover(helpButton);
    expect(curvedButton).toHaveFocus();
    await user.tab({ shift: true });
    expect(helpButton).toHaveAttribute("data-tooltip-visible", "true");
  });
});
