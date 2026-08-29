import { useRef } from "react";
import { AppHeader } from "./AppHeader";
import { ExternalFileNotice } from "../features/documents/ExternalFileNotice";
import { useDocumentSession } from "../features/documents/useDocumentSession";
import { useFolderBrowser } from "../features/file-browser/useFolderBrowser";
import { ReadingSettings } from "../features/reading/ReadingSettings";
import { useReadingPreferences } from "../features/reading/useReadingPreferences";
import { PaneDivider } from "../features/workspace/PaneDivider";
import { StageSidebarLayout } from "../features/workspace/StageSidebarLayout";
import { WorkspacePane } from "../features/workspace/WorkspacePane";
import { useWorkspaceController } from "../features/workspace/useWorkspaceController";
import {
  createAppEventChannel,
  type AppEventChannel,
} from "../shared/app-events";
import { AppStageSidebar } from "./AppStageSidebar";
import "../styles/base.css";
import "./App.css";

function App() {
  const appEventsRef = useRef<AppEventChannel | null>(null);
  if (appEventsRef.current === null) {
    appEventsRef.current = createAppEventChannel();
  }
  const events = appEventsRef.current;
  const documents = useDocumentSession({ events });
  const reading = useReadingPreferences();
  const workspace = useWorkspaceController({
    events,
    markdown: documents.document.markdown,
    isScrollSyncEnabled: reading.isScrollSyncEnabled,
  });
  const folderBrowser = useFolderBrowser({
    isActive: workspace.state.stageSidebar === "files",
  });
  const { state, search, elements, divider, actions } = workspace;

  return (
    <div
      className="app-shell"
      data-theme={reading.theme}
      data-font={reading.readingFont}
      data-line-spacing={reading.lineSpacing}
      style={reading.readingZoomStyle}
    >
      <AppHeader
        documentName={documents.document.name}
        documentPath={documents.document.path}
        saveStatus={documents.document.saveStatus}
        recovered={documents.document.recovered}
        isDocumentBrowserOpen={state.isDocumentBrowserOpen}
        isOutlineOpen={state.isOutlineOpen}
        isBusy={documents.isBusy}
        isSettingsOpen={state.isSettingsOpen}
        documentBrowserButtonRef={elements.documentBrowserButton}
        outlineButtonRef={elements.outlineButton}
        settingsRef={elements.settings}
        settingsButtonRef={elements.settingsButton}
        onDocumentBrowserToggle={() =>
          actions.toggleDocumentBrowser(folderBrowser.view)
        }
        onOutlineToggle={actions.toggleOutline}
        onOpenFile={() => void documents.openFromPicker("picker")}
        onSaveFile={() => void documents.saveDocument()}
        onSettingsToggle={actions.toggleSettings}
        settings={
          <ReadingSettings
            theme={reading.theme}
            readingFont={reading.readingFont}
            lineSpacing={reading.lineSpacing}
            onThemeChange={reading.selectTheme}
            onReadingFontChange={reading.selectReadingFont}
            onLineSpacingChange={reading.selectLineSpacing}
          />
        }
      />

      <StageSidebarLayout
        sidebar={
          state.stageSidebar ? (
            <AppStageSidebar
              documents={documents}
              folderBrowser={folderBrowser}
              workspace={workspace}
            />
          ) : null
        }
        closeLabel={
          state.stageSidebar === "outline" ? "목차 닫기" : "문서 탐색 닫기"
        }
        onClose={
          state.stageSidebar === "outline"
            ? actions.closeOutline
            : actions.closeDocumentSidebar
        }
      >
        <main
          ref={elements.workspace}
          className={`workspace${state.isPreviewFocusMode ? " is-preview-focus" : ""}`}
          inert={state.stageSidebar !== null && !state.isSidebarInset}
        >
          <div
            ref={elements.splitGuide}
            className="split-resize-guide"
            aria-hidden="true"
          />
          <WorkspacePane
            side="left"
            activePane={state.leftPaneContent}
            markdown={documents.document.markdown}
            note={documents.note.value}
            noteSaveStatus={documents.note.saveStatus}
            previewMarkdown={state.previewMarkdown}
            isPreviewUpdating={state.isPreviewUpdating}
            isPreviewFocusMode={state.isPreviewFocusMode}
            isHiddenByPreviewFocus={
              state.isPreviewFocusMode && state.leftPaneContent !== "preview"
            }
            onMarkdownChange={documents.editMarkdown}
            onNoteChange={documents.editNote}
            onSourceModeChange={actions.selectSourceMode}
            onPreviewScrollElementChange={elements.previewScroll}
            searchSession={search.sessions[state.leftPaneContent]}
            onSearchOpen={search.open}
            onSearchClose={search.close}
            onSearchChange={search.update}
            onSearchAreaActivate={search.activateArea}
            onSearchInputElementChange={elements.searchInput}
            onContentElementChange={elements.content}
            onPreviewFocusModeToggle={actions.togglePreviewFocusMode}
          />
          <PaneDivider
            dividerRef={elements.divider}
            isPreviewFocusMode={state.isPreviewFocusMode}
            isMenuOpen={state.isPanelLayoutMenuOpen}
            isScrollSyncEnabled={reading.isScrollSyncEnabled}
            isScrollSyncAvailable={state.isScrollSyncAvailable}
            isStacked={state.isWorkspaceStacked}
            onMenuOpen={actions.openPanelLayoutMenu}
            onMenuClose={actions.closePanelLayoutMenu}
            onScrollSyncToggle={reading.toggleScrollSync}
            onSwapPanes={actions.swapPanes}
            onResetSplit={actions.resetSplit}
            onKeyDown={divider.onKeyDown}
            onPointerDown={divider.onPointerDown}
            onPointerMove={divider.onPointerMove}
            onPointerUp={divider.onPointerUp}
            onPointerCancel={divider.onPointerCancel}
            onLostPointerCapture={divider.onLostPointerCapture}
          />
          <WorkspacePane
            side="right"
            activePane={state.rightPaneContent}
            markdown={documents.document.markdown}
            note={documents.note.value}
            noteSaveStatus={documents.note.saveStatus}
            previewMarkdown={state.previewMarkdown}
            isPreviewUpdating={state.isPreviewUpdating}
            isPreviewFocusMode={state.isPreviewFocusMode}
            isHiddenByPreviewFocus={
              state.isPreviewFocusMode && state.rightPaneContent !== "preview"
            }
            onMarkdownChange={documents.editMarkdown}
            onNoteChange={documents.editNote}
            onSourceModeChange={actions.selectSourceMode}
            onPreviewScrollElementChange={elements.previewScroll}
            searchSession={search.sessions[state.rightPaneContent]}
            onSearchOpen={search.open}
            onSearchClose={search.close}
            onSearchChange={search.update}
            onSearchAreaActivate={search.activateArea}
            onSearchInputElementChange={elements.searchInput}
            onContentElementChange={elements.content}
            onPreviewFocusModeToggle={actions.togglePreviewFocusMode}
          />
          {documents.visibleExternalFileState ? (
            <ExternalFileNotice
              state={documents.visibleExternalFileState}
              isReloading={documents.isReloading}
              noticeRef={elements.externalFileNotice}
              onReload={() => void documents.reloadDocument()}
              onDismiss={documents.dismissExternalFileNotice}
            />
          ) : null}
        </main>
      </StageSidebarLayout>
    </div>
  );
}

export default App;
