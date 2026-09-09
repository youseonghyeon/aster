import { render, cleanup } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { MarkdownPreview } from "./MarkdownPreview";
import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkGfm from "remark-gfm";
import { selectedMarkdown } from "../lib/preview-markdown-copy";

function copyRendered(content: string) {
  const { container } = render(<MarkdownPreview content={content} appearanceKey="paper" mermaidCurve="curved"/>);
  const article = container.querySelector('article')!;
  const range = document.createRange(); range.selectNodeContents(article);
  return selectedMarkdown(article, range)!;
}
afterEach(cleanup);
describe("Markdown copy through the real preview renderer", () => {
  it("uses one blank line between rendered headings", () => {
    expect(copyRendered('# AUDIT\n\n## 검토 결과\n\nPR #535')).toBe('# AUDIT\n\n## 검토 결과\n\nPR #535');
  });
  it.each([0,1,8])("does not copy table foster-parented whitespace for %i body rows", (count) => {
    const rows = Array.from({length:count},(_,i)=>`| PR-${i+1} | 결정 D-${i+1} |`).join('\n');
    const content = `# AUDIT\n\n> PR 검토 목록\n\n| PR | 결정 |\n| --- | --- |\n${rows}\n\n## 다음 단계`;
    const copy = copyRendered(content);
    expect(copy).not.toMatch(/\n{3}/);
    expect(copy).toContain('> PR 검토 목록\n\n| PR | 결정 |');
    expect(copy).toContain('|\n\n## 다음 단계');
    expect(copy.split('\n').filter(line=>line.startsWith('|'))).toHaveLength(count+2);
  });
  it("preserves code blank lines, hard breaks, and list paragraph boundaries", () => {
    const content = '앞  \n뒤\n\n```\nfirst\n\n\nlast\n```\n\n- 첫 문단\n\n  둘째 문단\n\n  - 하위\n\n> 인용 첫 문단\n>\n> 인용 둘째 문단';
    const copy = copyRendered(content);
    expect(copy).toContain('앞  \n뒤');
    expect(copy).toContain('```\nfirst\n\n\nlast\n```');
    expect(copy).toContain('- 첫 문단\n  \n  둘째 문단\n  - 하위');
    expect(copy).toContain('> 인용 첫 문단\n> \n> 인용 둘째 문단');
  });
  it("keeps compact and loose nested list structure", () => {
    expect(copyRendered('- 첫 항목\n  - 하위 항목\n- 둘째 항목')).toBe('- 첫 항목\n  - 하위 항목\n- 둘째 항목');
    expect(copyRendered('- 첫 문단\n\n  둘째 문단\n\n- 다음 항목')).toBe('- 첫 문단\n  \n  둘째 문단\n\n- 다음 항목');
  });
  it("escapes heading-like selected text while leaving inline issue numbers readable", () => {
    const content = '\\# 제목 아님\n\nPR #535·#538\n\n## 제목 \\#';
    const copied = copyRendered(content);
    expect(copied).toBe('\\# 제목 아님\n\nPR #535·#538\n\n## 제목 \\#');
  });
  it("roundtrips real-rendered table inline code, escaped pipes, links and partial selection", () => {
    const content = '| 값 | 링크 |\n| --- | --- |\n| `a\\|b` 및 **강조** | [문서](./한글%20문서.md) |';
    const copied = copyRendered(content);
    const ast = unified().use(remarkParse).use(remarkGfm).parse(copied);
    expect(ast).toMatchObject({children: [{type:'table', children: [
      {children: [{type:'tableCell'},{type:'tableCell'}]},
      {children: [
        {children: [{type:'inlineCode',value:'a|b'},{type:'text',value:' 및 '},{type:'strong'}]},
        {children: [{type:'link',url:encodeURI('./한글 문서.md')}]},
      ]},
    ]}]});
    const article = document.querySelector('article')!;
    const cells = article.querySelectorAll('td');
    const range = document.createRange(); range.selectNodeContents(cells[1]);
    expect(selectedMarkdown(article,range)).toBe('문서');
  });
  it("retains current GFM single-tilde rendering and intended strikethrough", () => {
    const copy = copyRendered('(PR-1~10, 결정 D-01~D-17)\n\n~~취소선~~\n\n`a`~`b`');
    expect(copy).toContain('(PR-1~~10, 결정 D-01~~D-17)');
    expect(copy).toContain('~~취소선~~');
    expect(copy).toContain('`a`\\~`b`');
  });
});
