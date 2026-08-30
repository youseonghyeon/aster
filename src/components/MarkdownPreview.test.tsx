import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { MarkdownPreview } from "./MarkdownPreview";

vi.mock("./SyntaxHighlightedCode", () => ({
  SyntaxHighlightedCode: ({
    code,
    language,
  }: {
    code: string;
    language: string;
  }) => (
    <div data-testid="syntax-code" data-language={language}>
      {code}
    </div>
  ),
}));
vi.mock("./MermaidDiagram", () => ({
  MermaidDiagram: ({
    source,
    sourceOffset,
    appearanceKey,
    curve,
  }: {
    source: string;
    sourceOffset?: string | number;
    appearanceKey: string;
    curve: string;
  }) => (
    <div
      data-testid="mermaid-diagram"
      data-source={source}
      data-source-offset={sourceOffset}
      data-appearance={appearanceKey}
      data-curve={curve}
    />
  ),
}));

describe("MarkdownPreview", () => {
  it("routes Mermaid fences to the diagram component", () => {
    render(
      <MarkdownPreview
        content={"앞 문단\n\n```mermaid\nflowchart LR\nA --> B\n```"}
        appearanceKey="night"
        mermaidCurve="straight"
      />,
    );

    const diagram = screen.getByTestId("mermaid-diagram");
    expect(diagram).toHaveAttribute("data-source", "flowchart LR\nA --> B");
    expect(diagram).toHaveAttribute("data-appearance", "night");
    expect(diagram).toHaveAttribute("data-curve", "straight");
    expect(diagram).toHaveAttribute("data-source-offset", "6");
    expect(screen.queryByTestId("syntax-code")).not.toBeInTheDocument();
  });

  it("keeps non-Mermaid fences on the syntax highlighting path", () => {
    render(
      <MarkdownPreview
        content={"```typescript\nconst ready = true;\n```"}
        appearanceKey="paper"
        mermaidCurve="curved"
      />,
    );

    expect(screen.getByTestId("syntax-code")).toHaveAttribute(
      "data-language",
      "typescript",
    );
    expect(screen.queryByTestId("mermaid-diagram")).not.toBeInTheDocument();
  });

  it("adds stable heading aliases and delegates links without WebView navigation", () => {
    const onLinkActivate = vi.fn();
    render(
      <MarkdownPreview
        content={"## 소개\n\n## 소개\n\n[다음](./next.md#%EC%86%8C%EA%B0%9C)"}
        appearanceKey="paper"
        mermaidCurve="curved"
        onLinkActivate={onLinkActivate}
      />,
    );

    const headings = screen.getAllByRole("heading", { name: "소개" });
    expect(headings[0]).toHaveAttribute("data-markdown-anchor", "소개");
    expect(headings[1]).toHaveAttribute("data-markdown-anchor", "소개-1");
    expect(fireEvent.click(screen.getByRole("link", { name: "다음" }))).toBe(false);
    expect(onLinkActivate).toHaveBeenCalledOnce();
    expect(onLinkActivate).toHaveBeenCalledWith("./next.md#%EC%86%8C%EA%B0%9C");
  });
});
