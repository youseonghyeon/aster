import { memo, useDeferredValue, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import "./App.css";

const initialMarkdown = `# 읽기 좋은 마크다운 뷰어

왼쪽에서 마크다운을 작성하면 오른쪽에서 **바로 확인**할 수 있습니다.

## 가독성을 위한 시작점

- 편안한 본문 너비와 넉넉한 줄 간격
- 제목과 본문이 명확하게 구분되는 크기
- 표, 체크리스트, 코드 블록을 지원하는 GitHub Flavored Markdown

> 좋은 문서는 내용뿐 아니라 읽는 경험도 중요합니다.

### 작업 목록

- [x] 좌우 분할 화면 만들기
- [x] 실시간 미리보기 연결하기
- [ ] 로컬 마크다운 파일 열기
- [ ] 글꼴과 테마 설정 추가하기

| 요소 | 상태 |
| --- | --- |
| 실시간 미리보기 | 준비됨 |
| 표와 체크리스트 | 준비됨 |

~~~ts
const message: string = "Aster에서 편안하게 읽기";
console.log(message);
~~~
`;

const markdownPlugins = [remarkGfm];

const MarkdownPreview = memo(function MarkdownPreview({
  content,
}: {
  content: string;
}) {
  return (
    <article className="markdown-body">
      <ReactMarkdown remarkPlugins={markdownPlugins}>{content}</ReactMarkdown>
    </article>
  );
});

function App() {
  const [markdown, setMarkdown] = useState(initialMarkdown);
  const deferredMarkdown = useDeferredValue(markdown);
  const isPreviewUpdating = markdown !== deferredMarkdown;

  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="brand" aria-label="Aster 마크다운 뷰어">
          <span className="brand-mark" aria-hidden="true">
            A
          </span>
          <span>Aster</span>
        </div>
        <span className="document-name">새 문서.md</span>
        <span className="character-count">
          {markdown.length.toLocaleString("ko-KR")}자
        </span>
      </header>

      <main className="workspace">
        <section className="pane editor-pane" aria-labelledby="editor-title">
          <div className="pane-header">
            <h2 id="editor-title">마크다운</h2>
            <span>입력</span>
          </div>
          <textarea
            id="markdown-editor"
            className="markdown-editor"
            value={markdown}
            onChange={(event) => setMarkdown(event.currentTarget.value)}
            aria-label="마크다운 입력"
            spellCheck="false"
          />
        </section>

        <section className="pane preview-pane" aria-labelledby="preview-title">
          <div className="pane-header">
            <h2 id="preview-title">미리보기</h2>
            <span aria-live="polite">
              {isPreviewUpdating ? "업데이트 중" : "실시간"}
            </span>
          </div>
          <div
            className={`preview-scroll${isPreviewUpdating ? " is-updating" : ""}`}
            aria-busy={isPreviewUpdating}
          >
            <MarkdownPreview content={deferredMarkdown} />
          </div>
        </section>
      </main>
    </div>
  );
}

export default App;
