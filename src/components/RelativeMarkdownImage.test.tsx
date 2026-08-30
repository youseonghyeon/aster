import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { RelativeMarkdownImage } from "./RelativeMarkdownImage";

describe("RelativeMarkdownImage", () => {
  it("resolves relative images and preserves alt text", async () => {
    const resolveImage = vi.fn(async () => "data:image/png;base64,AA==");
    render(
      <RelativeMarkdownImage
        src="../assets/cover.png"
        alt="표지"
        resolveImage={resolveImage}
      />,
    );

    expect(screen.getByRole("img", { name: "표지: 불러오는 중" })).toBeInTheDocument();
    const image = await screen.findByRole("img", { name: "표지" });
    expect(image).toHaveAttribute("src", "data:image/png;base64,AA==");
    expect(resolveImage).toHaveBeenCalledWith("../assets/cover.png");
  });

  it("shows a readable fallback after a relative image fails", async () => {
    render(
      <RelativeMarkdownImage
        src="./missing.png"
        alt="없는 이미지"
        resolveImage={vi.fn(async () => {
          throw new Error("missing");
        })}
      />,
    );

    await waitFor(() =>
      expect(
        screen.getByRole("img", { name: "없는 이미지: 불러오지 못했습니다." }),
      ).toHaveTextContent("이미지를 불러오지 못했습니다."),
    );
  });

  it("leaves external image URLs unchanged", () => {
    const resolveImage = vi.fn();
    render(
      <RelativeMarkdownImage
        src="https://example.com/cover.png"
        alt="외부 표지"
        resolveImage={resolveImage}
      />,
    );

    expect(screen.getByRole("img", { name: "외부 표지" })).toHaveAttribute(
      "src",
      "https://example.com/cover.png",
    );
    expect(resolveImage).not.toHaveBeenCalled();
  });
});
