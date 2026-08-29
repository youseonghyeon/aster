import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type UIEvent,
} from "react";
import { usePreviewSearch } from "../hooks/usePreviewSearch";
import { useTextSearch } from "../hooks/useTextSearch";
import {
  normalizeSearchIndex,
  type SearchArea,
  type SearchSession,
} from "../lib/text-search";
import { MarkdownPreview } from "./MarkdownPreview";
import { PaneSearchBar, SearchIcon } from "./PaneSearchBar";
import {
  SourceSearchHighlights,
  type SourceSearchHighlightsHandle,
} from "./SourceSearchHighlights";

export type PaneKind = "editor" | "preview";
export type PaneContent = PaneKind | "notes";
export type NoteSaveStatus = "saved" | "saving" | "error";

type WorkspacePaneProps = {
  side: "left" | "right";
  activePane: PaneContent;
  markdown: string;
  note: string;
  noteSaveStatus: NoteSaveStatus;
  previewMarkdown: string;
  isPreviewUpdating: boolean;
  isPreviewFocusMode: boolean;
  isHiddenByPreviewFocus: boolean;
  onMarkdownChange: (value: string) => void;
  onNoteChange: (value: string) => void;
  onSourceModeChange: (mode: "editor" | "notes") => void;
  onPreviewScrollElementChange: (element: HTMLDivElement | null) => void;
  searchSession: SearchSession;
  onSearchOpen: (area: SearchArea) => void;
  onSearchClose: (area: SearchArea) => void;
  onSearchChange: (area: SearchArea, patch: Partial<SearchSession>) => void;
  onSearchAreaActivate: (area: SearchArea) => void;
  onSearchInputElementChange: (
    area: SearchArea,
    element: HTMLInputElement | null,
  ) => void;
  onContentElementChange: (
    area: SearchArea,
    element: HTMLTextAreaElement | HTMLDivElement | null,
  ) => void;
  onPreviewFocusModeToggle: () => void;
};

function PreviewFocusIcon({ isActive }: { isActive: boolean }) {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true">
      {isActive ? (
        <path d="M3.5 7h3.5V3.5M16.5 7H13V3.5M3.5 13H7v3.5M16.5 13H13v3.5" />
      ) : (
        <path d="M7 3.5H3.5V7M13 3.5h3.5V7M7 16.5H3.5V13M13 16.5h3.5V13" />
      )}
    </svg>
  );
}

export function WorkspacePane({
  side,
  activePane,
  markdown,
  note,
  noteSaveStatus,
  previewMarkdown,
  isPreviewUpdating,
  isPreviewFocusMode,
  isHiddenByPreviewFocus,
  onMarkdownChange,
  onNoteChange,
  onSourceModeChange,
  onPreviewScrollElementChange,
  searchSession,
  onSearchOpen,
  onSearchClose,
  onSearchChange,
  onSearchAreaActivate,
  onSearchInputElementChange,
  onContentElementChange,
  onPreviewFocusModeToggle,
}: WorkspacePaneProps) {
  const isEditor = activePane === "editor";
  const isNotes = activePane === "notes";
  const isSourcePane = isEditor || isNotes;
  const hasNote = note.trim().length > 0;
  const paneLabel = side === "left" ? "왼쪽" : "오른쪽";
  const paneTitle = isEditor ? "마크다운" : isNotes ? "내 메모" : "미리보기";
  const searchArea: SearchArea = activePane;
  const searchAreaLabel = isEditor ? "마크다운" : isNotes ? "메모" : "미리보기";
  const sourceValue = isEditor ? markdown : isNotes ? note : "";
  const searchOptions = useMemo(
    () => ({
      isCaseSensitive: searchSession.isCaseSensitive,
      isRegex: searchSession.isRegex,
    }),
    [searchSession.isCaseSensitive, searchSession.isRegex],
  );
  const sourceSearchResult = useTextSearch(
    sourceValue,
    isSourcePane && searchSession.isOpen ? searchSession.query : "",
    searchOptions,
  );
  const [previewElement, setPreviewElement] = useState<HTMLDivElement | null>(null);
  const previewSearchResult = usePreviewSearch(
    previewElement,
    previewMarkdown,
    searchSession,
  );
  const searchResult = isSourcePane ? sourceSearchResult : previewSearchResult;
  const sourceElementRef = useRef<HTMLTextAreaElement | null>(null);
  const sourceSearchHighlightsRef =
    useRef<SourceSearchHighlightsHandle | null>(null);
  const sourceScrollFrameRef = useRef<number | null>(null);
  const hasSourceSearchHighlights =
    isSourcePane &&
    searchSession.isOpen &&
    searchSession.query.length > 0 &&
    !searchResult.error &&
    searchResult.matches.length > 0;
  const handleSourceElementChange = useCallback(
    (element: HTMLTextAreaElement | null) => {
      sourceElementRef.current = element;
      onContentElementChange(searchArea, element);
    },
    [onContentElementChange, searchArea],
  );
  const handlePreviewElementChange = useCallback(
    (element: HTMLDivElement | null) => {
      setPreviewElement(element);
      onPreviewScrollElementChange(element);
      onContentElementChange("preview", element);
    },
    [onContentElementChange, onPreviewScrollElementChange],
  );
  const handleSearchInputElementChange = useCallback(
    (element: HTMLInputElement | null) => {
      onSearchInputElementChange(searchArea, element);
    },
    [onSearchInputElementChange, searchArea],
  );
  const handleSourceScroll = useCallback(
    (_event: UIEvent<HTMLTextAreaElement>) => {
      if (sourceScrollFrameRef.current !== null) {
        return;
      }

      sourceScrollFrameRef.current = window.requestAnimationFrame(() => {
        sourceScrollFrameRef.current = null;
        const textarea = sourceElementRef.current;
        if (textarea) {
          sourceSearchHighlightsRef.current?.syncScrollToTextarea(textarea);
        }
      });
    },
    [],
  );

  useEffect(
    () => () => {
      if (sourceScrollFrameRef.current !== null) {
        window.cancelAnimationFrame(sourceScrollFrameRef.current);
      }
    },
    [],
  );
  const noteSaveLabel =
    noteSaveStatus === "saving"
      ? "저장 중…"
      : noteSaveStatus === "error"
        ? "저장하지 못함"
        : "저장됨";

  useLayoutEffect(() => {
    const textarea = sourceElementRef.current;

    if (
      !isSourcePane ||
      !textarea ||
      !searchSession.isOpen ||
      searchResult.error ||
      searchResult.matches.length === 0
    ) {
      return;
    }

    const activeIndex = normalizeSearchIndex(
      searchSession.currentIndex,
      searchResult.matches.length,
    );
    const match = searchResult.matches[activeIndex];
    sourceSearchHighlightsRef.current?.syncToTextarea(textarea);
    const selectionFrame = window.requestAnimationFrame(() => {
      textarea.setSelectionRange(match.start, match.end, "forward");
      sourceSearchHighlightsRef.current?.scrollCurrentMatchIntoView(textarea);
    });

    return () => window.cancelAnimationFrame(selectionFrame);
  }, [
    isSourcePane,
    searchResult.error,
    searchResult.matches,
    searchSession.currentIndex,
    searchSession.isOpen,
    sourceValue,
  ]);

  useLayoutEffect(() => {
    const textarea = sourceElementRef.current;

    if (!hasSourceSearchHighlights || !textarea) {
      return;
    }

    const syncHighlights = () =>
      sourceSearchHighlightsRef.current?.syncToTextarea(textarea);
    syncHighlights();
    const resizeObserver = new ResizeObserver(syncHighlights);
    resizeObserver.observe(textarea);

    return () => {
      resizeObserver.disconnect();
    };
  }, [hasSourceSearchHighlights, searchArea]);

  function navigateSearch(direction: -1 | 1) {
    if (searchResult.matches.length === 0 || searchResult.error) {
      return;
    }

    const activeIndex = normalizeSearchIndex(
      searchSession.currentIndex,
      searchResult.matches.length,
    );
    onSearchChange(searchArea, { currentIndex: activeIndex + direction });
  }

  return (
    <section
      id={`${side}-pane`}
      className={`pane ${isEditor ? "editor-pane" : isNotes ? "notes-pane" : "preview-pane"}${searchSession.isOpen ? " has-search" : ""}${isHiddenByPreviewFocus ? " is-focus-hidden" : ""}`}
      aria-label={`${paneLabel} ${paneTitle} 패널`}
      aria-hidden={isHiddenByPreviewFocus || undefined}
      inert={isHiddenByPreviewFocus}
    >
      <div className="pane-header">
        {isSourcePane ? (
          <div className="document-mode-tabs" role="group" aria-label="작성 화면 선택">
            <button
              type="button"
              className="document-mode-tab"
              aria-pressed={isEditor}
              onClick={() => onSourceModeChange("editor")}
            >
              마크다운
            </button>
            <button
              type="button"
              className="document-mode-tab"
              aria-label={hasNote ? "메모, 작성된 내용 있음" : "메모"}
              aria-pressed={isNotes}
              title="메모 (⌘/Ctrl ⇧ M)"
              onClick={() => onSourceModeChange("notes")}
            >
              메모
              {hasNote ? <span className="note-presence-dot" aria-hidden="true" /> : null}
            </button>
          </div>
        ) : (
          <span className="pane-title">{paneTitle}</span>
        )}
        <div className="pane-header-actions">
          {isNotes ? (
            <span className={`note-save-status is-${noteSaveStatus}`} aria-live="polite">
              {noteSaveLabel}
            </span>
          ) : null}
          <button
            type="button"
            className="pane-search-trigger"
            aria-label={`${searchAreaLabel} 검색`}
            aria-expanded={searchSession.isOpen}
            title={`${searchAreaLabel} 검색 (⌘/Ctrl F)`}
            onClick={() => onSearchOpen(searchArea)}
          >
            <SearchIcon />
          </button>
          {!isSourcePane ? (
            <button
              type="button"
              className="pane-search-trigger preview-focus-trigger"
              aria-label={isPreviewFocusMode ? "미리보기 집중 모드 종료" : "미리보기 집중 모드"}
              aria-pressed={isPreviewFocusMode}
              title={isPreviewFocusMode ? "미리보기 집중 모드 종료 (Escape)" : "미리보기 집중 모드"}
              onClick={onPreviewFocusModeToggle}
            >
              <PreviewFocusIcon isActive={isPreviewFocusMode} />
            </button>
          ) : null}
        </div>
      </div>

      {searchSession.isOpen ? (
        <PaneSearchBar
          areaLabel={searchAreaLabel}
          session={searchSession}
          matchCount={searchResult.matches.length}
          error={searchResult.error}
          isTruncated={searchResult.isTruncated}
          onInputElementChange={handleSearchInputElementChange}
          onQueryChange={(query) => onSearchChange(searchArea, { query, currentIndex: 0 })}
          onCaseSensitiveChange={(isCaseSensitive) => onSearchChange(searchArea, { isCaseSensitive, currentIndex: 0 })}
          onRegexChange={(isRegex) => onSearchChange(searchArea, { isRegex, currentIndex: 0 })}
          onNavigate={navigateSearch}
          onClose={() => onSearchClose(searchArea)}
          onActivate={() => onSearchAreaActivate(searchArea)}
        />
      ) : null}

      {isSourcePane ? (
        <div
          className={`source-editor-stack ${isEditor ? "is-markdown" : "is-notes"}`}
        >
          {hasSourceSearchHighlights ? (
            <SourceSearchHighlights
              ref={sourceSearchHighlightsRef}
              area={isEditor ? "editor" : "notes"}
              value={sourceValue}
              matches={searchResult.matches}
              currentIndex={searchSession.currentIndex}
            />
          ) : null}
          {isEditor ? (
            <textarea
              key="markdown-editor"
              ref={handleSourceElementChange}
              id="markdown-editor"
              name="markdown"
              className="markdown-editor"
              value={markdown}
              onChange={(event) => onMarkdownChange(event.currentTarget.value)}
              onScroll={handleSourceScroll}
              aria-label="마크다운 입력"
              autoComplete="off"
              spellCheck="false"
              onFocus={() => onSearchAreaActivate("editor")}
              onPointerDown={() => onSearchAreaActivate("editor")}
            />
          ) : (
            <textarea
              key="document-note"
              ref={handleSourceElementChange}
              id="document-note"
              name="document-note"
              className="note-editor"
              value={note}
              placeholder="이 문서를 읽으며 떠오른 생각이나 확인할 내용을 적어보세요."
              onChange={(event) => onNoteChange(event.currentTarget.value)}
              onScroll={handleSourceScroll}
              aria-label="이 문서에 대한 개인 메모"
              autoComplete="off"
              autoFocus
              spellCheck="true"
              onFocus={() => onSearchAreaActivate("notes")}
              onPointerDown={() => onSearchAreaActivate("notes")}
            />
          )}
        </div>
      ) : (
        <div
          ref={handlePreviewElementChange}
          className={`preview-scroll${isPreviewUpdating ? " is-updating" : ""}`}
          aria-busy={isPreviewUpdating}
          aria-label="미리보기 내용"
          tabIndex={0}
          onFocus={() => onSearchAreaActivate("preview")}
          onPointerDown={() => onSearchAreaActivate("preview")}
        >
          <MarkdownPreview content={previewMarkdown} />
          {previewSearchResult.overlays.length > 0 ? (
            <div className="preview-search-overlays" aria-hidden="true">
              {previewSearchResult.overlays.map((overlay) => (
                <span
                  key={overlay.id}
                  className={`preview-search-overlay${overlay.isCurrent ? " is-current" : ""}`}
                  style={{
                    top: overlay.top,
                    left: overlay.left,
                    width: overlay.width,
                    height: overlay.height,
                  }}
                />
              ))}
            </div>
          ) : null}
        </div>
      )}
    </section>
  );
}
