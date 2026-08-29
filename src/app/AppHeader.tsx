import type { ReactNode, Ref } from "react";

export type AppHeaderProps = {
  documentName: string;
  documentPath: string | null;
  isRecentDocumentsOpen: boolean;
  isOutlineOpen: boolean;
  isBusy: boolean;
  isSettingsOpen: boolean;
  recentDocumentsButtonRef: Ref<HTMLButtonElement>;
  outlineButtonRef: Ref<HTMLButtonElement>;
  settingsRef: Ref<HTMLDivElement>;
  settingsButtonRef: Ref<HTMLButtonElement>;
  onRecentDocumentsToggle: () => void;
  onOutlineToggle: () => void;
  onOpenFile: () => void;
  onSettingsToggle: () => void;
  settings: ReactNode;
};

function AsterBrandIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4.2 6.8c3.1-1 5.7-.7 7.8.8V18c-2.3-1.4-4.9-1.7-7.8-.8V6.8Z" />
      <path d="M19.8 6.8c-3.1-1-5.7-.7-7.8.8V18c2.3-1.4 4.9-1.7 7.8-.8V6.8Z" />
      <g className="brand-aster">
        <path d="M12 9v5" />
        <path d="m9.85 10.25 4.3 2.5" />
        <path d="m9.85 12.75 4.3-2.5" />
      </g>
    </svg>
  );
}

function RecentDocumentsIcon() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true">
      <path d="M6.25 3.5h8.25v10.75H6.25z" />
      <path d="M6.25 6H3.5v10.5h8.25v-2.25" />
    </svg>
  );
}

function DocumentOutlineIcon() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true">
      <path d="M4 5.25h1.5M8.25 5.25H16M4 10h1.5M8.25 10H16M4 14.75h1.5M8.25 14.75H13.5" />
    </svg>
  );
}

function OpenFileIcon() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true">
      <path d="M3.25 6h4.4l1.5 1.75h7.6v7a1 1 0 0 1-1 1H4.25a1 1 0 0 1-1-1V6Z" />
      <path d="M3.25 8.75h13.5" />
    </svg>
  );
}

function ReadingSettingsIcon() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true">
      <path d="M3.25 5.25h4.1m3.3 0h6.1M3.25 10h8.1m3.3 0h2.1M3.25 14.75h2.1m3.3 0h8.1" />
      <circle cx="9" cy="5.25" r="1.65" />
      <circle cx="13" cy="10" r="1.65" />
      <circle cx="7" cy="14.75" r="1.65" />
    </svg>
  );
}

export function AppHeader({
  documentName,
  documentPath,
  isRecentDocumentsOpen,
  isOutlineOpen,
  isBusy,
  isSettingsOpen,
  recentDocumentsButtonRef,
  outlineButtonRef,
  settingsRef,
  settingsButtonRef,
  onRecentDocumentsToggle,
  onOutlineToggle,
  onOpenFile,
  onSettingsToggle,
  settings,
}: AppHeaderProps) {
  return (
    <header className="app-header">
      <div className="header-leading">
        <div className="brand" aria-label="Aster 마크다운 뷰어">
          <span className="brand-mark" aria-hidden="true">
            <AsterBrandIcon />
          </span>
          <span>Aster</span>
        </div>
        <span className="header-group-divider" aria-hidden="true" />
        <nav className="stage-navigation" aria-label="문서 탐색">
          <button
            ref={recentDocumentsButtonRef}
            className="header-icon-button recent-documents-trigger"
            type="button"
            aria-label={isRecentDocumentsOpen ? "최근 문서 닫기" : "최근 문서 열기"}
            aria-expanded={isRecentDocumentsOpen}
            aria-controls="document-sidebar"
            title={isRecentDocumentsOpen ? "최근 문서 닫기" : "최근 문서 열기"}
            onClick={onRecentDocumentsToggle}
          >
            <RecentDocumentsIcon />
          </button>
          <button
            ref={outlineButtonRef}
            className="header-icon-button outline-trigger"
            type="button"
            aria-label={isOutlineOpen ? "문서 목차 닫기" : "문서 목차 열기"}
            aria-expanded={isOutlineOpen}
            aria-controls="document-outline"
            title={isOutlineOpen ? "문서 목차 닫기" : "문서 목차 열기"}
            onClick={onOutlineToggle}
          >
            <DocumentOutlineIcon />
          </button>
        </nav>
      </div>
      <span className="document-name" title={documentPath ?? documentName}>
        {documentName}
      </span>
      <div className="header-actions">
        <button
          className="header-icon-button open-file-trigger"
          type="button"
          aria-label="Markdown 파일 열기"
          title="Markdown 파일 열기 (⌘/Ctrl O)"
          disabled={isBusy}
          onClick={onOpenFile}
        >
          <OpenFileIcon />
        </button>
        <div ref={settingsRef} className="settings-menu">
          <button
            ref={settingsButtonRef}
            className="header-icon-button settings-trigger"
            type="button"
            aria-label="읽기 설정"
            aria-expanded={isSettingsOpen}
            aria-controls="reading-settings-popover"
            title="읽기 설정"
            onClick={onSettingsToggle}
          >
            <ReadingSettingsIcon />
          </button>
          {isSettingsOpen ? settings : null}
        </div>
      </div>
    </header>
  );
}
