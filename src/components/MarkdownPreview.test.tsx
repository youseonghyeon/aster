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
  it("updates ordinary text while preserving the article and unchanged reading blocks", () => {
    const props = { appearanceKey: "paper", mermaidCurve: "straight" as const };
    const { container, rerender } = render(
      <MarkdownPreview {...props} content={"# 제목\n\n읽고 있는 문단\n\n작성 중"} />,
    );
    const article = container.querySelector("article");
    const heading = container.querySelector("h1");
    const paragraph = screen.getByText("읽고 있는 문단");
    for (const text of ["작성 중인", "작성 중인 한글", "작성 중인 한글 문장"]) {
      rerender(<MarkdownPreview {...props} content={`# 제목\n\n읽고 있는 문단\n\n${text}`} />);
      expect(container.querySelector("article")).toBe(article);
      expect(container.querySelector("h1")).toBe(heading);
      expect(screen.getByText("읽고 있는 문단")).toBe(paragraph);
      expect(screen.getByText(text)).toBeInTheDocument();
    }
  });

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

describe("nested Markdown lists", () => {
  it.each([
    {label: "tight", content: "- xxxx\n   - yyy\n   - zzz\n- next", paragraph: false},
    {label: "loose", content: "- xxxx\n\n   - yyy\n   - zzz\n\n- next", paragraph: true},
  ])("keeps $label nesting and the next parent as separate semantic items", ({content, paragraph}) => {
    const {container} = render(<MarkdownPreview content={content} appearanceKey="paper" mermaidCurve="curved" />);
    const root = container.querySelector(".markdown-body > ul")!;
    expect(root.children.length).toBe(2);
    const parent = root.firstElementChild!;
    expect(parent.querySelectorAll(":scope > ul > li")).toHaveLength(2);
    expect(Boolean(parent.querySelector(":scope > p"))).toBe(paragraph);
    expect(root.lastElementChild?.textContent?.trim()).toBe("next");
  });

  it("keeps completed task state read-only and driven by Markdown updates", () => {
    const props = { appearanceKey: "paper", mermaidCurve: "curved" as const };
    const { container, rerender } = render(<MarkdownPreview {...props} content={"- [ ] 아직 할 일\n- [x] 완료한 일"} />);
    const boxes = container.querySelectorAll('input[type="checkbox"]');
    expect(boxes).toHaveLength(2);
    expect(boxes[0]).not.toBeChecked();
    expect(boxes[1]).toBeChecked();
    expect(boxes[0]).toBeDisabled();
    expect(boxes[1]).toBeDisabled();
    rerender(<MarkdownPreview {...props} content={"- [ ] 아직 할 일\n- [ ] 완료 취소"} />);
    expect(container.querySelectorAll('input[type="checkbox"]')[1]).not.toBeChecked();
    rerender(<MarkdownPreview {...props} content={"- [ ] 아직 할 일\n- [x] 다시 완료"} />);
    expect(container.querySelectorAll('input[type="checkbox"]')[1]).toBeChecked();
    expect(container.querySelectorAll('input[type="checkbox"]')[1]).toBeDisabled();
  });

  it("preserves paragraphs and mixed three-level lists with checkboxes", () => {
    const content = "1. 부모 항목\n   - [ ] 긴 한글 문장이 줄바꿈되어도 같은 항목이어야 합니다\n     1. 셋째 깊이\n     2. 셋째 다음 항목\n\n   이어지는 부모 문단입니다.\n\n2. 다음 부모";
    const {container} = render(<MarkdownPreview content={content} appearanceKey="night" mermaidCurve="curved" />);
    expect(container.querySelectorAll(".markdown-body > ol > li")).toHaveLength(2);
    expect(container.querySelectorAll("ol > li > ul > li > ol > li")).toHaveLength(2);
    expect(container.querySelector('input[type="checkbox"]')).toBeDisabled();
    expect(screen.getByText("이어지는 부모 문단입니다.")).toHaveProperty("tagName", "P");
  });
});
