import { render, screen } from "@testing-library/react";
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
  }: {
    source: string;
    sourceOffset?: string | number;
    appearanceKey: string;
  }) => (
    <div
      data-testid="mermaid-diagram"
      data-source={source}
      data-source-offset={sourceOffset}
      data-appearance={appearanceKey}
    />
  ),
}));

describe("MarkdownPreview", () => {
  it("routes Mermaid fences to the diagram component", () => {
    render(
      <MarkdownPreview
        content={"앞 문단\n\n```mermaid\nflowchart LR\nA --> B\n```"}
        appearanceKey="night"
      />,
    );

    const diagram = screen.getByTestId("mermaid-diagram");
    expect(diagram).toHaveAttribute("data-source", "flowchart LR\nA --> B");
    expect(diagram).toHaveAttribute("data-appearance", "night");
    expect(diagram).toHaveAttribute("data-source-offset", "6");
    expect(screen.queryByTestId("syntax-code")).not.toBeInTheDocument();
  });

  it("keeps non-Mermaid fences on the syntax highlighting path", () => {
    render(
      <MarkdownPreview
        content={"```typescript\nconst ready = true;\n```"}
        appearanceKey="paper"
      />,
    );

    expect(screen.getByTestId("syntax-code")).toHaveAttribute(
      "data-language",
      "typescript",
    );
    expect(screen.queryByTestId("mermaid-diagram")).not.toBeInTheDocument();
  });
});
