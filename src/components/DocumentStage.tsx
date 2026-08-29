import type { ReactNode } from "react";
import type { MarkdownOutlineItem } from "../lib/markdown-outline";
import type { RecentDocument } from "../features/documents/recent-documents";
import { DocumentOutline } from "./DocumentOutline";
import { DocumentSidebar } from "./DocumentSidebar";

type DocumentStageProps = {
  stageSidebar: "outline" | "recent" | null;
  isSidebarInset: boolean;
  recentDocuments: RecentDocument[];
  documentPath: string | null;
  unavailableRecentDocumentPaths: ReadonlySet<string>;
  isBusy: boolean;
  isRecentDocumentPersistenceLimited: boolean;
  outlineItems: MarkdownOutlineItem[];
  activeHeadingId: string | null;
  onDocumentSidebarClose: () => void;
  onOpenFile: () => void;
  onRecentDocumentSelect: (document: RecentDocument) => void;
  onOutlineClose: () => void;
  onOutlineNavigate: (headingId: string, shouldMoveFocus: boolean) => void;
  children: ReactNode;
};

export function DocumentStage({
  stageSidebar,
  isSidebarInset,
  recentDocuments,
  documentPath,
  unavailableRecentDocumentPaths,
  isBusy,
  isRecentDocumentPersistenceLimited,
  outlineItems,
  activeHeadingId,
  onDocumentSidebarClose,
  onOpenFile,
  onRecentDocumentSelect,
  onOutlineClose,
  onOutlineNavigate,
  children,
}: DocumentStageProps) {
  return (
    <div className={`document-stage${stageSidebar ? " has-sidebar" : ""}`}>
      {stageSidebar === "recent" ? (
        <>
          <DocumentSidebar
            documents={recentDocuments}
            currentDocumentPath={documentPath}
            unavailableDocumentPaths={unavailableRecentDocumentPaths}
            isModal={!isSidebarInset}
            isBusy={isBusy}
            isPersistenceLimited={isRecentDocumentPersistenceLimited}
            onClose={onDocumentSidebarClose}
            onOpenFile={onOpenFile}
            onSelectDocument={onRecentDocumentSelect}
          />
          <button
            type="button"
            className="sidebar-scrim"
            tabIndex={-1}
            aria-label="최근 문서 닫기"
            onClick={onDocumentSidebarClose}
          />
        </>
      ) : null}

      {stageSidebar === "outline" ? (
        <>
          <DocumentOutline
            items={outlineItems}
            activeHeadingId={activeHeadingId}
            documentKey={documentPath ?? "untitled"}
            isModal={!isSidebarInset}
            onClose={onOutlineClose}
            onNavigate={onOutlineNavigate}
          />
          <button
            type="button"
            className="sidebar-scrim"
            tabIndex={-1}
            aria-label="목차 닫기"
            onClick={onOutlineClose}
          />
        </>
      ) : null}

      {children}
    </div>
  );
}
