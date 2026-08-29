import { DocumentOutline } from "../features/documents/DocumentOutline";
import { DocumentSidebar } from "../features/documents/DocumentSidebar";
import type { useDocumentSession } from "../features/documents/useDocumentSession";
import { FolderBrowser } from "../features/file-browser/FolderBrowser";
import { readFolderMarkdown } from "../features/file-browser/folder-gateway";
import type { useFolderBrowser } from "../features/file-browser/useFolderBrowser";
import type { useWorkspaceController } from "../features/workspace/useWorkspaceController";

type AppStageSidebarProps = {
  documents: ReturnType<typeof useDocumentSession>;
  folderBrowser: ReturnType<typeof useFolderBrowser>;
  workspace: ReturnType<typeof useWorkspaceController>;
};

export function AppStageSidebar({
  documents,
  folderBrowser,
  workspace,
}: AppStageSidebarProps) {
  const { state, outline, actions } = workspace;

  if (state.stageSidebar === "files") {
    return (
      <FolderBrowser
        state={folderBrowser.state}
        currentDocumentPath={documents.document.path}
        isModal={!state.isSidebarInset}
        isDocumentBusy={documents.isBusy}
        isPersistenceLimited={folderBrowser.isPersistenceLimited}
        operationError={folderBrowser.operationError}
        onClose={actions.closeDocumentSidebar}
        onRecentView={() => {
          folderBrowser.actions.setView("recent");
          actions.showDocumentBrowser("recent");
        }}
        onChooseRoot={() => void folderBrowser.actions.chooseRoot()}
        onClearRoot={() => void folderBrowser.actions.clearRoot()}
        onRefresh={() => void folderBrowser.actions.refresh()}
        onSelectEntry={folderBrowser.actions.selectEntry}
        onToggleDirectory={folderBrowser.actions.toggleDirectory}
        onRetryDirectory={folderBrowser.actions.retryDirectory}
        onOpenMarkdown={(rootToken, entry) =>
          void documents.openDocument(entry.path, "folder", () =>
            readFolderMarkdown(rootToken, entry.relativePath),
          )
        }
        onOpenImage={(entry) => void folderBrowser.actions.openImage(entry)}
      />
    );
  }

  if (state.stageSidebar === "recent") {
    return (
      <DocumentSidebar
        documents={documents.recent.documents}
        currentDocumentPath={documents.document.path}
        unavailableDocumentPaths={documents.recent.unavailablePaths}
        isModal={!state.isSidebarInset}
        isBusy={documents.isBusy}
        isPersistenceLimited={documents.recent.persistenceLimited}
        onClose={actions.closeDocumentSidebar}
        onFilesView={() => {
          folderBrowser.actions.setView("files");
          actions.showDocumentBrowser("files");
        }}
        onOpenFile={() => void documents.openFromPicker("picker")}
        onSelectDocument={documents.openRecentDocument}
      />
    );
  }

  if (state.stageSidebar === "outline") {
    return (
      <DocumentOutline
        items={outline.items}
        activeHeadingId={outline.activeHeadingId}
        documentKey={documents.document.path ?? "untitled"}
        isModal={!state.isSidebarInset}
        onClose={actions.closeOutline}
        onNavigate={actions.navigateOutline}
      />
    );
  }

  return null;
}
