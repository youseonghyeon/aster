import { afterEach, describe, expect, it } from "vitest";
import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkGfm from "remark-gfm";
import { selectedMarkdown } from "./preview-markdown-copy";

function fixture(html: string) {
  const root = document.createElement("article"); root.innerHTML = html; document.body.append(root);
  const range = document.createRange(); range.selectNodeContents(root);
  return { root, range, copy: () => selectedMarkdown(root, range) };
}
afterEach(() => { document.body.replaceChildren(); });
describe("preview Markdown selection", () => {
  it("keeps heading level for text-only Korean heading selection", () => {
    const {root,range,copy} = fixture('<h2>한글 제목</h2>');
    range.selectNodeContents(root.querySelector('h2')!); expect(copy()).toBe('## 한글 제목');
    range.setStart(root.querySelector('h2')!.firstChild!,3); expect(copy()).toBe('## 제목');
  });
  it("clips repeated text by range and retains inline semantics", () => {
    const {root,range,copy} = fixture('<p>same <strong>same Korean 한글</strong> same</p>');
    const text = root.querySelector('strong')!.firstChild!;
    range.setStart(text,5); range.setEnd(text,11); expect(copy()).toBe('**Korean**');
  });
  it("retains selected links without double encoding and escapes literal syntax", () => {
    const {copy} = fixture('<p><a href="./한글%20문서.md">문서</a> * literal<br>next</p>');
    expect(copy()).toBe('[문서](<./한글%20문서.md>) \\* literal  \nnext');
  });
  it("supports highlighted code with backticks without escaping the code", () => {
    const {copy} = fixture('<div data-copy-language="js"><pre><code><span>const </span>x = `a`;</code></pre></div>');
    expect(copy()).toBe('```js\nconst x = `a`;\n```');
  });
  it("uses longer inline code delimiters", () => {
    expect(fixture('<p><code>`x`</code></p>').copy()).toBe('`` `x` ``');
  });
  it("keeps task states, nested lists, and starting ordered numbers", () => {
    const output = fixture('<ol start="3"><li>one<ul><li><input type="checkbox" checked>done</li></ul></li><li>two</li></ol>').copy();
    expect(output).toContain('3. one'); expect(output).toContain('   - [x] done'); expect(output).toContain('4. two');
  });
  it("copies full tables with headers and alignment", () => {
    const {copy} = fixture('<table><thead><tr><th align="right">이름</th><th>상태</th></tr></thead><tbody><tr><td>A</td><td><strong>완료</strong></td></tr></tbody></table>');
    expect(copy()).toBe('| 이름 | 상태 |\n| ---: | --- |\n| A | **완료** |');
  });
  it("roundtrips pipes in table code, text, and links without adding columns", () => {
    const markdown = fixture('<table><tr><th>Code</th><th>Link</th></tr><tr><td><code>a|b</code> a|b</td><td><a href="https://example.com/a|b">link</a></td></tr></table>').copy()!;
    const ast = unified().use(remarkParse).use(remarkGfm).parse(markdown);
    expect(ast).toMatchObject({children: [{type: 'table', children: [
      {children: [{type: 'tableCell'}, {type: 'tableCell'}]},
      {children: [{children: [{type: 'inlineCode', value: 'a|b'}, {type: 'text', value: ' a|b'}]}, {children: [{type: 'link', url: 'https://example.com/a|b'}]}]},
    ]}]});
  });
  it("copies partial table text only, never unselected header or cells", () => {
    const {root,range,copy} = fixture('<table><tr><th>Name</th><th>Status</th></tr><tr><td>alpha</td><td>done</td></tr></table>');
    const cells = root.querySelectorAll('td'); range.setStart(cells[0].firstChild!,2); range.setEnd(cells[1].firstChild!,2);
    expect(copy()).toBe('pha\tdo');
  });
  it("does not include unselected paragraphs", () => {
    const {root,range,copy} = fixture('<p>before</p><p>chosen <em>part</em></p><p>after</p>');
    range.selectNodeContents(root.children[1]); expect(copy()).toBe('chosen *part*');
  });
  it("rejects empty and outside ranges", () => {
    const {root,range,copy} = fixture('<p>inside</p>'); range.collapse(true); expect(copy()).toBeNull();
    range.selectNode(root); expect(copy()).toBeNull();
  });
  it("rejects diagrams instead of copying unrelated source or controls", () => {
    expect(fixture('<div class="mermaid-diagram"><svg><text>label</text></svg><button>Zoom</button></div>').copy()).toBeNull();
  });
  it("copies selected images using original Markdown path", () => {
    expect(fixture('<p><img src="asset://local" data-copy-src="./한글.png" alt="그림"></p>').copy()).toBe('![그림](<./한글.png>)');
  });
});
