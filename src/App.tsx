import {
  memo,
  useDeferredValue,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent,
} from "react";
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
const minimumPaneWidth = 240;
const dividerWidth = 9;

type PaneKind = "editor" | "preview";
type PaneSide = "left" | "right";

const oppositePane: Record<PaneKind, PaneKind> = {
  editor: "preview",
  preview: "editor",
};

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

function Pane({
  side,
  activePane,
  markdown,
  previewMarkdown,
  isPreviewUpdating,
  onSelectPane,
  onMarkdownChange,
}: {
  side: PaneSide;
  activePane: PaneKind;
  markdown: string;
  previewMarkdown: string;
  isPreviewUpdating: boolean;
  onSelectPane: (pane: PaneKind) => void;
  onMarkdownChange: (value: string) => void;
}) {
  const isEditor = activePane === "editor";
  const paneLabel = side === "left" ? "왼쪽" : "오른쪽";

  return (
    <section
      id={`${side}-pane`}
      className={`pane ${isEditor ? "editor-pane" : "preview-pane"}`}
      role="tabpanel"
      aria-labelledby={`${side}-${activePane}-tab`}
    >
      <div className="pane-header">
        <div className="pane-tabs" role="tablist" aria-label={`${paneLabel} 패널`}>
          <button
            id={`${side}-editor-tab`}
            className={`pane-tab${isEditor ? " is-active" : ""}`}
            type="button"
            role="tab"
            aria-selected={isEditor}
            aria-controls={`${side}-pane`}
            onClick={() => onSelectPane("editor")}
          >
            마크다운
          </button>
          <button
            id={`${side}-preview-tab`}
            className={`pane-tab${isEditor ? "" : " is-active"}`}
            type="button"
            role="tab"
            aria-selected={!isEditor}
            aria-controls={`${side}-pane`}
            onClick={() => onSelectPane("preview")}
          >
            미리보기
          </button>
        </div>
        <span aria-live={isEditor ? undefined : "polite"}>
          {isEditor ? "입력" : isPreviewUpdating ? "업데이트 중" : "실시간"}
        </span>
      </div>

      {isEditor ? (
        <textarea
          id="markdown-editor"
          className="markdown-editor"
          value={markdown}
          onChange={(event) => onMarkdownChange(event.currentTarget.value)}
          aria-label="마크다운 입력"
          spellCheck="false"
        />
      ) : (
        <div
          className={`preview-scroll${isPreviewUpdating ? " is-updating" : ""}`}
          aria-busy={isPreviewUpdating}
        >
          <MarkdownPreview content={previewMarkdown} />
        </div>
      )}
    </section>
  );
}

function App() {
  const [markdown, setMarkdown] = useState(initialMarkdown);
  const [leftPane, setLeftPane] = useState<PaneKind>("editor");
  const workspaceRef = useRef<HTMLElement>(null);
  const dividerRef = useRef<HTMLDivElement>(null);
  const splitPercentRef = useRef(50);
  const deferredMarkdown = useDeferredValue(markdown);
  const isPreviewUpdating = markdown !== deferredMarkdown;
  const rightPane = oppositePane[leftPane];

  function updateSplit(nextPercent: number) {
    const workspace = workspaceRef.current;

    if (!workspace) {
      return;
    }

    const workspaceWidth = workspace.getBoundingClientRect().width;
    const minimumPercent = (minimumPaneWidth / workspaceWidth) * 100;
    const maximumPercent =
      ((workspaceWidth - dividerWidth - minimumPaneWidth) / workspaceWidth) * 100;
    const clampedPercent = Math.min(
      maximumPercent,
      Math.max(minimumPercent, nextPercent),
    );

    splitPercentRef.current = clampedPercent;
    workspace.style.setProperty("--left-pane-width", `${clampedPercent}%`);
    dividerRef.current?.setAttribute(
      "aria-valuenow",
      Math.round(clampedPercent).toString(),
    );
  }

  function updateSplitFromPointer(clientX: number) {
    const workspace = workspaceRef.current;

    if (!workspace) {
      return;
    }

    const bounds = workspace.getBoundingClientRect();
    updateSplit(((clientX - bounds.left) / bounds.width) * 100);
  }

  function handleDividerPointerDown(event: PointerEvent<HTMLDivElement>) {
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    workspaceRef.current?.classList.add("is-resizing");
    updateSplitFromPointer(event.clientX);
  }

  function handleDividerPointerMove(event: PointerEvent<HTMLDivElement>) {
    if (!event.currentTarget.hasPointerCapture(event.pointerId)) {
      return;
    }

    updateSplitFromPointer(event.clientX);
  }

  function handleDividerPointerEnd(event: PointerEvent<HTMLDivElement>) {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }

    workspaceRef.current?.classList.remove("is-resizing");
  }

  function handleDividerKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const step = event.shiftKey ? 10 : 2;
    let nextPercent = splitPercentRef.current;

    switch (event.key) {
      case "ArrowLeft":
        nextPercent -= step;
        break;
      case "ArrowRight":
        nextPercent += step;
        break;
      case "Home":
        nextPercent = 0;
        break;
      case "End":
        nextPercent = 100;
        break;
      default:
        return;
    }

    event.preventDefault();
    updateSplit(nextPercent);
  }

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

      <main ref={workspaceRef} className="workspace">
        <Pane
          side="left"
          activePane={leftPane}
          markdown={markdown}
          previewMarkdown={deferredMarkdown}
          isPreviewUpdating={isPreviewUpdating}
          onSelectPane={setLeftPane}
          onMarkdownChange={setMarkdown}
        />
        <div
          ref={dividerRef}
          className="pane-divider"
          role="separator"
          aria-label="패널 너비 조절"
          aria-orientation="vertical"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={50}
          tabIndex={0}
          title="드래그하여 패널 너비 조절 · 더블 클릭하여 초기화"
          onDoubleClick={() => updateSplit(50)}
          onKeyDown={handleDividerKeyDown}
          onPointerDown={handleDividerPointerDown}
          onPointerMove={handleDividerPointerMove}
          onPointerUp={handleDividerPointerEnd}
          onPointerCancel={handleDividerPointerEnd}
        />
        <Pane
          side="right"
          activePane={rightPane}
          markdown={markdown}
          previewMarkdown={deferredMarkdown}
          isPreviewUpdating={isPreviewUpdating}
          onSelectPane={(pane) => setLeftPane(oppositePane[pane])}
          onMarkdownChange={setMarkdown}
        />
      </main>
    </div>
  );
}

export default App;
