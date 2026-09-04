import type { useDocumentSession } from "../features/documents/useDocumentSession";
import { ExternalFileNotice } from "../features/documents/ExternalFileNotice";
import { useFolderBrowser } from "../features/file-browser/useFolderBrowser";
import { ReadingSettings } from "../features/reading/ReadingSettings";
import type { useReadingPreferences } from "../features/reading/useReadingPreferences";
import { UpdateNotice } from "../features/updates/UpdateNotice";
import { useUpdateCheck } from "../features/updates/useUpdateCheck";
import { PaneDivider } from "../features/workspace/PaneDivider";
import { StageSidebarLayout } from "../features/workspace/StageSidebarLayout";
import { WorkspacePane } from "../features/workspace/WorkspacePane";
import { useWorkspaceController } from "../features/workspace/useWorkspaceController";
import type { AppEventChannel } from "../shared/app-events";
import { AppHeader } from "./AppHeader";
import { AppStageSidebar } from "./AppStageSidebar";
import { useLinkNavigationController } from "./useLinkNavigationController";

type AppWorkspaceProps = {
  events: AppEventChannel;
  documents: ReturnType<typeof useDocumentSession>;
  reading: ReturnType<typeof useReadingPreferences>;
  isBlockingModalOpen: () => boolean;
};

export function AppWorkspace({
  events,
  documents,
  reading,
  isBlockingModalOpen,
}: AppWorkspaceProps) {
  const workspace = useWorkspaceController({
    events,
    documentPath: documents.document.path,
    markdown: documents.document.markdown,
    isScrollSyncEnabled: reading.isScrollSyncEnabled,
    isBlockingModalOpen,
  });
  const folderBrowser = useFolderBrowser({
    isActive: workspace.state.stageSidebar === "files",
  });
  const { state, search, elements, divider, actions } = workspace;
  const navigation = useLinkNavigationController({
    events,
    documentPath: documents.document.path,
    previewDocumentPath: state.previewDocumentPath,
    previewElement: workspace.navigation.previewElement,
    openDocument: documents.openDocument,
  });
  const updateCheck = useUpdateCheck();

  return (
    <div
      className="app-shell"
      data-theme={reading.theme}
      data-font={reading.readingFont}
      data-line-spacing={reading.lineSpacing}
      style={reading.readingStyle}
    >
      <AppHeader
        documentName={documents.document.name}
        documentPath={documents.document.path}
        saveStatus={documents.document.saveStatus}
        recovered={documents.document.recovered}
        isDocumentBrowserOpen={state.isDocumentBrowserOpen}
        isOutlineOpen={state.isOutlineOpen}
        isBusy={documents.isBusy}
        canGoBack={navigation.canGoBack}
        canGoForward={navigation.canGoForward}
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
        onGoBack={() => void navigation.goBack()}
        onGoForward={() => void navigation.goForward()}
        onSettingsToggle={actions.toggleSettings}
        settings={
          <ReadingSettings
            theme={reading.theme}
            readingFont={reading.readingFont}
            readingFontSize={reading.readingFontSize}
            lineSpacing={reading.lineSpacing}
            mermaidCurve={reading.mermaidCurve}
            onThemeChange={reading.selectTheme}
            onReadingFontChange={reading.selectReadingFont}
            onReadingFontSizeChange={reading.selectReadingFontSize}
            onLineSpacingChange={reading.selectLineSpacing}
            onMermaidCurveChange={reading.selectMermaidCurve}
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
        isSidebarInset={state.isSidebarInset}
        sidebarWidth={folderBrowser.sidebarWidth}
        onClose={
          state.stageSidebar === "outline"
            ? actions.closeOutline
            : actions.closeDocumentSidebar
        }
        onSidebarWidthChange={folderBrowser.actions.setSidebarWidth}
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
            previewDocumentPath={state.previewDocumentPath}
            previewAppearanceKey={`${reading.theme}:${reading.readingFont}:${reading.readingFontSize}:${reading.readingZoom}`}
            mermaidCurve={reading.mermaidCurve}
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
            onLinkActivate={navigation.activateLink}
            resolveRelativeImage={navigation.resolveRelativeImage}
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
            previewDocumentPath={state.previewDocumentPath}
            previewAppearanceKey={`${reading.theme}:${reading.readingFont}:${reading.readingFontSize}:${reading.readingZoom}`}
            mermaidCurve={reading.mermaidCurve}
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
            onLinkActivate={navigation.activateLink}
            resolveRelativeImage={navigation.resolveRelativeImage}
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
          {updateCheck.visibleUpdateCheck ? (
            <UpdateNotice
              update={updateCheck.visibleUpdateCheck}
              isStacked={documents.visibleExternalFileState !== null}
              onDismiss={updateCheck.dismiss}
            />
          ) : null}
        </main>
      </StageSidebarLayout>
    </div>
  );
}
