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

  it("renders sanitized HTML and keeps explicit anchors addressable", () => {
    render(
      <MarkdownPreview
        content={`[Go to English version](#english-version)

<a id="english-version" tabindex="4" accesskey="e"></a>

<a name="legacy-anchor"></a>

<h2 id="Raw-Heading">Raw heading</h2>

<div><strong>English</strong><br><kbd>Command</kbd></div>`}
        appearanceKey="paper"
        mermaidCurve="curved"
      />,
    );

    expect(screen.queryByText(/<a id=/)).not.toBeInTheDocument();
    const explicitAnchor = document.querySelector(
      '[data-markdown-html-id="english-version"]',
    );
    expect(explicitAnchor).toHaveAttribute(
      "id",
      "aster-user-content-english-version",
    );
    expect(explicitAnchor).toHaveAttribute("tabindex", "-1");
    expect(explicitAnchor).not.toHaveAttribute("accesskey");
    expect(
      document.querySelector('[data-markdown-html-name="legacy-anchor"]'),
    ).toHaveAttribute("name", "aster-user-content-legacy-anchor");
    const rawHeading = screen.getByRole("heading", { name: "Raw heading" });
    expect(rawHeading).toHaveAttribute("id", expect.stringMatching(/^aster-heading-/u));
    expect(rawHeading).toHaveAttribute("data-markdown-html-id", "Raw-Heading");
    expect(screen.getByText("English").tagName).toBe("STRONG");
    expect(screen.getByText("Command").tagName).toBe("KBD");
  });

  it("sanitizes executable HTML and author-controlled application attributes", () => {
    render(
      <MarkdownPreview
        content={`<script>window.unsafe = true</script>
<style>.app-shell { display: none }</style>
<iframe src="https://example.com">frame</iframe>
<svg><script>alert(1)</script><text>vector</text></svg>
<div class="preview-search-overlays" style="position:fixed" data-preview-search-ignore="true" tabindex="0" accesskey="s" onclick="alert(1)">Safe text</div>
<a href="javascript:alert(1)" onclick="alert(2)">Unsafe link</a>
<img src="file:///tmp/private.png" onerror="alert(3)" alt="Unsafe image">`}
        appearanceKey="paper"
        mermaidCurve="curved"
      />,
    );

    expect(document.querySelector("script, style, iframe, svg")).toBeNull();
    expect(screen.queryByText(/window\.unsafe|display: none|frame|vector/)).toBeNull();
    const safeText = screen.getByText("Safe text");
    expect(safeText).not.toHaveAttribute("class");
    expect(safeText).not.toHaveAttribute("style");
    expect(safeText).not.toHaveAttribute("data-preview-search-ignore");
    expect(safeText).not.toHaveAttribute("tabindex");
    expect(safeText).not.toHaveAttribute("accesskey");
    expect(safeText).not.toHaveAttribute("onclick");
    expect(screen.getByText("Unsafe link")).not.toHaveAttribute("href");
    expect(screen.getByAltText("Unsafe image")).not.toHaveAttribute("src");
  });

  it("routes raw HTML tables and language code through existing components", () => {
    render(
      <MarkdownPreview
        content={`<table><tbody><tr><td>값</td></tr></tbody></table>

<pre><code class="language-typescript">const ready = true;</code></pre>`}
        appearanceKey="paper"
        mermaidCurve="curved"
      />,
    );

    expect(screen.getByRole("region", { name: "표" })).toContainElement(
      screen.getByRole("table"),
    );
    expect(screen.getByTestId("syntax-code")).toHaveAttribute(
      "data-language",
      "typescript",
    );
  });

  it("routes raw links, relative images, and Mermaid code through existing gateways", async () => {
    const onLinkActivate = vi.fn();
    const resolveRelativeImage = vi.fn(async () =>
      "data:image/png;base64,AA==",
    );
    render(
      <MarkdownPreview
        content={`<a href="./next.md#target">다음 문서</a>

<img src="./cover.png" alt="표지">

<pre><code class="language-mermaid">flowchart LR
A --&gt; B</code></pre>`}
        appearanceKey="paper"
        mermaidCurve="curved"
        onLinkActivate={onLinkActivate}
        resolveRelativeImage={resolveRelativeImage}
      />,
    );

    fireEvent.click(screen.getByRole("link", { name: "다음 문서" }));
    expect(onLinkActivate).toHaveBeenCalledWith("./next.md#target");
    expect(await screen.findByRole("img", { name: "표지" })).toHaveAttribute(
      "src",
      "data:image/png;base64,AA==",
    );
    expect(resolveRelativeImage).toHaveBeenCalledWith("./cover.png");
    expect(screen.getByTestId("mermaid-diagram")).toHaveAttribute(
      "data-source",
      "flowchart LR\nA --> B",
    );
  });

  it("adds source offsets to raw HTML blocks", () => {
    const content = `<details><summary>요약</summary><div>본문</div></details>`;
    render(
      <MarkdownPreview
        content={content}
        appearanceKey="paper"
        mermaidCurve="curved"
      />,
    );

    expect(screen.getByText("요약").closest("details")).toHaveAttribute(
      "data-source-offset",
      "0",
    );
    expect(screen.getByText("본문")).toHaveAttribute("data-source-offset");
  });
});
