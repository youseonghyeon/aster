import { AssetIcon } from "../components/icons/AssetIcon";
import browserIcon from "../assets/icons/document-browser.svg";
import backIcon from "../assets/icons/history-back.svg";
import forwardIcon from "../assets/icons/history-forward.svg";
import settingsIcon from "../assets/icons/reading-settings.svg";
import outlineIcon from "../assets/icons/outline.svg";
import openIcon from "../assets/icons/folder-open.svg";
import type { ReactNode, Ref } from "react";
import type { MarkdownSaveStatus } from "../features/documents/document-session-state";

export type AppHeaderProps = {
  documentName: string;
  documentPath: string | null;
  saveStatus: MarkdownSaveStatus;
  recovered: boolean;
  isDocumentBrowserOpen: boolean;
  isOutlineOpen: boolean;
  isBusy: boolean;
  canGoBack: boolean;
  canGoForward: boolean;
  isSettingsOpen: boolean;
  documentBrowserButtonRef: Ref<HTMLButtonElement>;
  outlineButtonRef: Ref<HTMLButtonElement>;
  settingsRef: Ref<HTMLDivElement>;
  settingsButtonRef: Ref<HTMLButtonElement>;
  onDocumentBrowserToggle: () => void;
  onOutlineToggle: () => void;
  onOpenFile: () => void;
  onGoBack: () => void;
  onGoForward: () => void;
  onSettingsToggle: () => void;
  settings: ReactNode;
};

export function AppHeader({
  documentName,
  documentPath,
  saveStatus,
  recovered,
  isDocumentBrowserOpen,
  isOutlineOpen,
  isBusy,
  canGoBack,
  canGoForward,
  isSettingsOpen,
  documentBrowserButtonRef,
  outlineButtonRef,
  settingsRef,
  settingsButtonRef,
  onDocumentBrowserToggle,
  onOutlineToggle,
  onOpenFile,
  onGoBack,
  onGoForward,
  onSettingsToggle,
  settings,
}: AppHeaderProps) {
  const saveStatusLabel =
    saveStatus === "saving"
      ? "저장 중…"
      : saveStatus === "modified"
        ? recovered
          ? "복구됨 · 저장되지 않음"
          : "저장되지 않음"
        : saveStatus === "conflict"
          ? recovered
            ? "복구됨 · 원본 변경"
            : "원본 변경 충돌"
          : saveStatus === "error"
            ? "저장 오류"
            : documentPath
              ? "저장됨"
              : "새 문서";

  return (
    <header className="app-header" data-tauri-drag-region="">
      <div className="header-leading" data-tauri-drag-region="">
        <nav className="history-navigation" aria-label="문서 이동 기록">
          <button
            className="header-icon-button history-trigger"
            type="button"
            aria-label="뒤로 이동"
            title={
              isBusy
                ? "문서를 처리하는 동안 뒤로 이동할 수 없습니다"
                : canGoBack
                  ? "뒤로 이동"
                  : "뒤로 이동할 기록 없음"
            }
            data-disabled-reason={isBusy ? "busy" : !canGoBack ? "empty" : undefined}
            disabled={isBusy || !canGoBack}
            onClick={onGoBack}
          >
            <AssetIcon src={backIcon} />
          </button>
          <button
            className="header-icon-button history-trigger"
            type="button"
            aria-label="앞으로 이동"
            title={
              isBusy
                ? "문서를 처리하는 동안 앞으로 이동할 수 없습니다"
                : canGoForward
                  ? "앞으로 이동"
                  : "앞으로 이동할 기록 없음"
            }
            data-disabled-reason={
              isBusy ? "busy" : !canGoForward ? "empty" : undefined
            }
            disabled={isBusy || !canGoForward}
            onClick={onGoForward}
          >
            <AssetIcon src={forwardIcon} />
          </button>
        </nav>
        <nav className="stage-navigation" aria-label="문서 탐색">
          <button
            ref={documentBrowserButtonRef}
            className="header-icon-button recent-documents-trigger"
            type="button"
            aria-label={isDocumentBrowserOpen ? "문서 탐색 닫기" : "문서 탐색 열기"}
            aria-expanded={isDocumentBrowserOpen}
            aria-controls="document-sidebar"
            title={isDocumentBrowserOpen ? "문서 탐색 닫기" : "문서 탐색 열기"}
            onClick={onDocumentBrowserToggle}
          >
            <AssetIcon src={browserIcon} />
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
            <AssetIcon src={outlineIcon} />
          </button>
        </nav>
      </div>
      <div
        className="document-identity"
        title={documentPath ?? documentName}
        data-tauri-drag-region=""
      >
        <span className="document-name" data-tauri-drag-region="">
          {documentName}
        </span>
        <span
          className="document-save-status"
          data-status={saveStatus}
          data-tauri-drag-region=""
          role="status"
          aria-live="polite"
        >
          {saveStatusLabel}
        </span>
      </div>
      <div className="header-actions">
        <button
          className="header-icon-button open-file-trigger"
          type="button"
          aria-label="Markdown 파일 열기"
          title="Markdown 파일 열기 (⌘/Ctrl O)"
          disabled={isBusy}
          onClick={onOpenFile}
        >
          <AssetIcon src={openIcon} />
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
            <AssetIcon src={settingsIcon} />
          </button>
          {isSettingsOpen ? settings : null}
        </div>
      </div>
    </header>
  );
}
