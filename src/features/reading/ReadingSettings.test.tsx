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
});
