import { useEffect, useRef, type KeyboardEvent } from "react";
import type { RecentDocument } from "./recent-documents";
import "./DocumentSidebar.css";

type DocumentSidebarProps = {
  documents: RecentDocument[];
  currentDocumentPath: string | null;
  unavailableDocumentPaths: ReadonlySet<string>;
  isModal: boolean;
  isBusy: boolean;
  isPersistenceLimited: boolean;
  onClose: () => void;
  onFilesView: () => void;
  onOpenFile: () => void;
  onSelectDocument: (document: RecentDocument) => void;
};

function CloseIcon() {
  return (
    <svg viewBox="0 0 18 18" aria-hidden="true">
      <path d="m4.5 4.5 9 9m0-9-9 9" />
    </svg>
  );
}

function FileIcon() {
  return (
    <svg viewBox="0 0 18 18" aria-hidden="true">
      <path d="M4.5 2.75h5.25l3.75 3.75v8.75h-9z" />
      <path d="M9.75 2.75V6.5h3.75" />
    </svg>
  );
}

function OpenFileIcon() {
  return (
    <svg viewBox="0 0 18 18" aria-hidden="true">
      <path d="M2.75 5.25h4l1.4 1.5h7.1l-1.5 7.5h-11z" />
      <path d="M2.75 5.25V3.75h4.5l1.4 1.5h4.6v1.5" />
    </svg>
  );
}

function UnavailableIcon() {
  return (
    <svg viewBox="0 0 14 14" aria-hidden="true">
      <circle cx="7" cy="7" r="5" />
      <path d="M7 4.25v3.3m0 2.05v.15" />
    </svg>
  );
}

function formatParentPath(path: string) {
  const normalizedPath = path.replace(/\\/g, "/");
  const pathParts = normalizedPath.split("/").filter(Boolean);
  pathParts.pop();

  if (pathParts.length === 0) {
    return "상위 폴더";
  }

  const visibleParts = pathParts.slice(-2).join("/");
  const prefix = pathParts.length > 2 ? "…/" : normalizedPath.startsWith("/") ? "/" : "";
  return `${prefix}${visibleParts}`;
}

export function DocumentSidebar({
  documents,
  currentDocumentPath,
  unavailableDocumentPaths,
  isModal,
  isBusy,
  isPersistenceLimited,
  onClose,
  onFilesView,
  onOpenFile,
  onSelectDocument,
}: DocumentSidebarProps) {
  const sidebarRef = useRef<HTMLElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const openFileButtonRef = useRef<HTMLButtonElement>(null);
  const firstTransitionButtonRef = useRef<HTMLButtonElement>(null);
  const previousIsModalRef = useRef(isModal);
  const firstTransitionDocument = documents.find(
    (document) => document.path !== currentDocumentPath,
  );

  useEffect(() => {
    (
      firstTransitionButtonRef.current ??
      openFileButtonRef.current ??
      closeButtonRef.current
    )?.focus();
  }, []);

  useEffect(() => {
    const becameModal = isModal && !previousIsModalRef.current;
    previousIsModalRef.current = isModal;

    if (
      becameModal &&
      !sidebarRef.current?.contains(document.activeElement)
    ) {
      (
        firstTransitionButtonRef.current ??
        openFileButtonRef.current ??
        closeButtonRef.current
      )?.focus();
    }
  }, [isModal]);

  useEffect(() => {
    if (isModal && isBusy) {
      closeButtonRef.current?.focus();
    }
  }, [isBusy, isModal]);

  function handleKeyDown(event: KeyboardEvent<HTMLElement>) {
    if (!isModal || event.key !== "Tab") {
      return;
    }

    const focusableElements = Array.from(
      sidebarRef.current?.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [tabindex]:not([tabindex="-1"])',
      ) ?? [],
    );
    const firstElement = focusableElements[0];
    const lastElement = focusableElements[focusableElements.length - 1];

    if (!firstElement || !lastElement) {
      return;
    }

    if (event.shiftKey && document.activeElement === firstElement) {
      event.preventDefault();
      lastElement.focus();
    } else if (!event.shiftKey && document.activeElement === lastElement) {
      event.preventDefault();
      firstElement.focus();
    }
  }

  return (
    <aside
      ref={sidebarRef}
      id="document-sidebar"
      className="document-sidebar"
      role={isModal ? "dialog" : undefined}
      aria-modal={isModal ? true : undefined}
      aria-labelledby="document-sidebar-title"
      onKeyDown={handleKeyDown}
    >
      <header className="document-sidebar-header">
        <div>
          <span className="document-sidebar-eyebrow">문서</span>
          <h2 id="document-sidebar-title">최근 문서</h2>
        </div>
        <button
          ref={closeButtonRef}
          type="button"
          className="document-sidebar-close"
          aria-label="최근 문서 닫기"
          title="최근 문서 닫기"
          onClick={onClose}
        >
          <CloseIcon />
        </button>
      </header>

      <div className="document-browser-tabs" role="tablist" aria-label="문서 탐색 보기">
        <button type="button" role="tab" aria-selected="false" onClick={onFilesView}>
          파일
        </button>
        <button type="button" role="tab" aria-selected="true">
          최근
        </button>
      </div>

      <div className="recent-document-content">
        {documents.length > 0 ? (
          <nav aria-label="최근에 연 Markdown 문서">
            <ol className="recent-document-list">
              {documents.map((document) => {
                const isCurrent = document.path === currentDocumentPath;
                const isUnavailable = unavailableDocumentPaths.has(document.path);
                const isFirstTransition =
                  document.path === firstTransitionDocument?.path;

                return (
                  <li key={document.path}>
                    <button
                      ref={isFirstTransition ? firstTransitionButtonRef : undefined}
                      type="button"
                      className="recent-document-button"
                      aria-current={isCurrent ? "page" : undefined}
                      aria-label={`${document.name}${isCurrent ? ", 현재 문서" : ""}${isUnavailable ? ", 연결 끊김" : ""}`}
                      title={document.path}
                      disabled={isBusy}
                      onClick={() => onSelectDocument(document)}
                    >
                      <span className="recent-document-icon">
                        <FileIcon />
                      </span>
                      <span className="recent-document-details">
                        <span className="recent-document-name">{document.name}</span>
                        <span className="recent-document-location">
                          {formatParentPath(document.path)}
                        </span>
                        {isCurrent || isUnavailable ? (
                          <span className="recent-document-statuses">
                            {isCurrent ? (
                              <span className="recent-document-status is-current">
                                현재
                              </span>
                            ) : null}
                            {isUnavailable ? (
                              <span className="recent-document-status is-unavailable">
                                <UnavailableIcon />
                                연결 끊김
                              </span>
                            ) : null}
                          </span>
                        ) : null}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ol>
          </nav>
        ) : (
          <div className="recent-document-empty">
            <FileIcon />
            <strong>최근에 연 문서가 없습니다</strong>
            <span>Markdown 파일을 열면 이곳에서 다시 열 수 있습니다.</span>
          </div>
        )}
      </div>

      <footer className="document-sidebar-footer">
        {isPersistenceLimited ? (
          <p className="recent-document-storage-warning" role="status">
            최근 목록을 저장할 수 없어 이번 실행에서만 유지됩니다.
          </p>
        ) : null}
        <button
          ref={openFileButtonRef}
          type="button"
          className="document-sidebar-open"
          disabled={isBusy}
          onClick={onOpenFile}
        >
          <OpenFileIcon />
          Markdown 파일 열기
        </button>
      </footer>
    </aside>
  );
}
