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

    render(
      <ReadingSettings
        theme="paper"
        readingFont="pretendard"
        lineSpacing="balanced"
        onThemeChange={onThemeChange}
        onReadingFontChange={onReadingFontChange}
        onLineSpacingChange={onLineSpacingChange}
      />,
    );

    await user.click(screen.getByRole("button", { name: "야간" }));
    await user.click(screen.getByRole("button", { name: "글꼴" }));
    await user.click(screen.getByRole("option", { name: "Noto Serif KR" }));
    await user.click(screen.getByRole("button", { name: "여유 1.9" }));

    expect(onThemeChange).toHaveBeenCalledWith("night");
    expect(onReadingFontChange).toHaveBeenCalledWith("noto-serif");
    expect(onLineSpacingChange).toHaveBeenCalledWith("relaxed");
  });
});
