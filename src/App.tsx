import { useRef } from "react";
import { AppHeader } from "./components/AppHeader";
import { DocumentStage } from "./components/DocumentStage";
import { PaneDivider } from "./features/workspace/PaneDivider";
import { WorkspacePane } from "./features/workspace/WorkspacePane";
import { ExternalFileNotice } from "./features/documents/ExternalFileNotice";
import type { RecentDocument } from "./features/documents/recent-documents";
import { useDocumentSession } from "./features/documents/useDocumentSession";
import { ReadingSettings } from "./features/reading/ReadingSettings";
import { useReadingPreferences } from "./features/reading/useReadingPreferences";
import { useWorkspaceController } from "./features/workspace/useWorkspaceController";
import {
  createAppEventChannel,
  type AppEventChannel,
} from "./shared/app-events";
import "./styles/base.css";
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
  const { state, outline, search, elements, divider, actions } = workspace;

  function handleRecentDocumentSelect(document: RecentDocument) {
    void documents.openDocument(document.path, "recent");
  }

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
        isRecentDocumentsOpen={state.isRecentDocumentsOpen}
        isOutlineOpen={state.isOutlineOpen}
        isBusy={documents.isBusy}
        isSettingsOpen={state.isSettingsOpen}
        recentDocumentsButtonRef={elements.recentDocumentsButton}
        outlineButtonRef={elements.outlineButton}
        settingsRef={elements.settings}
        settingsButtonRef={elements.settingsButton}
        onRecentDocumentsToggle={actions.toggleRecentDocuments}
        onOutlineToggle={actions.toggleOutline}
        onOpenFile={() => void documents.openFromPicker("picker")}
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

      <DocumentStage
        stageSidebar={state.stageSidebar}
        isSidebarInset={state.isSidebarInset}
        recentDocuments={documents.recent.documents}
        documentPath={documents.document.path}
        unavailableRecentDocumentPaths={documents.recent.unavailablePaths}
        isBusy={documents.isBusy}
        isRecentDocumentPersistenceLimited={
          documents.recent.persistenceLimited
        }
        outlineItems={outline.items}
        activeHeadingId={outline.activeHeadingId}
        onDocumentSidebarClose={actions.closeDocumentSidebar}
        onOpenFile={() => void documents.openFromPicker("picker")}
        onRecentDocumentSelect={handleRecentDocumentSelect}
        onOutlineClose={actions.closeOutline}
        onOutlineNavigate={actions.navigateOutline}
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
      </DocumentStage>
    </div>
  );
}

export default App;
