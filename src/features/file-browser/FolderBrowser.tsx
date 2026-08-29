import {
  useEffect,
  useLayoutEffect,
  useRef,
  type KeyboardEvent,
} from "react";
import type { FolderEntry } from "./folder-gateway";
import type { FolderTreeState } from "./folder-tree-state";
import { FolderTree } from "./FolderTree";
import "./FolderBrowser.css";

type FolderBrowserProps = {
  state: FolderTreeState;
  currentDocumentPath: string | null;
  isModal: boolean;
  isDocumentBusy: boolean;
  isPersistenceLimited: boolean;
  operationError: string | null;
  onClose: () => void;
  onRecentView: () => void;
  onChooseRoot: () => void;
  onClearRoot: () => void;
  onRefresh: () => void;
  onSelectEntry: (path: string) => void;
  onToggleDirectory: (entry: FolderEntry) => void;
  onRetryDirectory: (directory: string) => void;
  onOpenMarkdown: (rootPath: string, entry: FolderEntry) => void;
  onOpenImage: (entry: FolderEntry) => void;
};

function CloseIcon() {
  return (
    <svg viewBox="0 0 18 18" aria-hidden="true">
      <path d="m4.5 4.5 9 9m0-9-9 9" />
    </svg>
  );
}

function FolderIcon() {
  return (
    <svg viewBox="0 0 18 18" aria-hidden="true">
      <path d="M2.5 5h5l1.5 1.75h6.5v8.5h-13z" />
    </svg>
  );
}

export function FolderBrowser({
  state,
  currentDocumentPath,
  isModal,
  isDocumentBusy,
  isPersistenceLimited,
  operationError,
  onClose,
  onRecentView,
  onChooseRoot,
  onClearRoot,
  onRefresh,
  onSelectEntry,
  onToggleDirectory,
  onRetryDirectory,
  onOpenMarkdown,
  onOpenImage,
}: FolderBrowserProps) {
  const sidebarRef = useRef<HTMLElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const changeFolderButtonRef = useRef<HTMLButtonElement>(null);
  const previousIsModalRef = useRef(isModal);
  const hadTreeFocusRef = useRef(false);

  function findPreferredFocusTarget() {
    return (
      sidebarRef.current?.querySelector<HTMLElement>(
        '[role="treeitem"][tabindex="0"]',
      ) ??
      sidebarRef.current?.querySelector<HTMLElement>(
        '[role="treeitem"], [data-primary-action="true"]',
      )
    );
  }

  useEffect(() => {
    const focusTarget = findPreferredFocusTarget();
    (focusTarget ?? closeButtonRef.current)?.focus();
  }, []);

  useEffect(() => {
    const becameModal = isModal && !previousIsModalRef.current;
    previousIsModalRef.current = isModal;
    if (becameModal && !sidebarRef.current?.contains(document.activeElement)) {
      const focusTarget = findPreferredFocusTarget();
      (focusTarget ?? closeButtonRef.current)?.focus();
    }
  }, [isModal]);

  function handleKeyDown(event: KeyboardEvent<HTMLElement>) {
    if (!isModal || event.key !== "Tab") return;
    const focusable = Array.from(
      sidebarRef.current?.querySelectorAll<HTMLElement>(
        'button:not([disabled]):not([tabindex="-1"]), [tabindex="0"]',
      ) ?? [],
    );
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (!first || !last) return;
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  function showRecentView() {
    onRecentView();
    window.requestAnimationFrame(() =>
      document.getElementById("document-recent-tab")?.focus(),
    );
  }

  const rootListing = state.directories[""];
  const isLoadingRoot = state.rootStatus === "loading" && !state.root;
  const isEmpty =
    state.root &&
    rootListing?.status === "loaded" &&
    rootListing.entries.length === 0;
  const isLoadingListing =
    state.root &&
    (!rootListing ||
      rootListing.status === "idle" ||
      (rootListing.status === "loading" && rootListing.entries.length === 0));
  const isRootListingBusy = rootListing?.status === "loading";
  const hasCachedEntries = Boolean(rootListing?.entries.length);
  const hasVisibleTree = Boolean(
    state.root &&
      rootListing &&
      !isLoadingListing &&
      (rootListing.status !== "error" || hasCachedEntries) &&
      !isEmpty,
  );

  useLayoutEffect(() => {
    if (hasVisibleTree || !hadTreeFocusRef.current) return;
    if (sidebarRef.current?.contains(document.activeElement)) return;
    hadTreeFocusRef.current = false;
    (changeFolderButtonRef.current ?? closeButtonRef.current)?.focus();
  }, [hasVisibleTree]);

  return (
    <aside
      ref={sidebarRef}
      id="document-sidebar"
      className="document-sidebar folder-browser"
      role={isModal ? "dialog" : undefined}
      aria-modal={isModal ? true : undefined}
      aria-labelledby="folder-browser-title"
      onKeyDown={handleKeyDown}
      onFocusCapture={(event) => {
        hadTreeFocusRef.current =
          (event.target as HTMLElement).getAttribute("role") === "treeitem";
      }}
    >
      <header className="document-sidebar-header">
        <div>
          <span className="document-sidebar-eyebrow">문서</span>
          <h2 id="folder-browser-title">{state.root?.name ?? "문서 탐색"}</h2>
        </div>
        <button
          ref={closeButtonRef}
          type="button"
          className="document-sidebar-close"
          aria-label="문서 탐색 닫기"
          title="문서 탐색 닫기"
          onClick={onClose}
        >
          <CloseIcon />
        </button>
      </header>

      <div
        className="document-browser-tabs"
        role="tablist"
        aria-label="문서 탐색 보기"
      >
        <button
          id="document-files-tab"
          type="button"
          role="tab"
          aria-selected="true"
          aria-controls="document-browser-panel"
          tabIndex={0}
          onKeyDown={(event) => {
            if (
              event.key === "ArrowLeft" ||
              event.key === "ArrowRight" ||
              event.key === "End"
            ) {
              event.preventDefault();
              showRecentView();
            }
          }}
        >
          파일
        </button>
        <button
          id="document-recent-tab"
          type="button"
          role="tab"
          aria-selected="false"
          aria-controls="document-browser-panel"
          tabIndex={-1}
          onClick={showRecentView}
        >
          최근
        </button>
      </div>

      <div
        id="document-browser-panel"
        className={`folder-browser-content${hasVisibleTree ? " has-visible-tree" : ""}`}
        role="tabpanel"
        aria-labelledby="document-files-tab"
        aria-busy={isLoadingRoot || Boolean(isRootListingBusy)}
      >
        {isLoadingRoot ? (
          <div className="folder-browser-message" role="status">
            <strong>폴더를 확인하고 있습니다</strong>
            <span>저장된 폴더 경로를 다시 연결하는 중입니다.</span>
          </div>
        ) : !state.root ? (
          <div className="folder-browser-message">
            <FolderIcon />
            <strong>탐색할 폴더를 선택하세요</strong>
            <span>Markdown 문서와 관련 이미지만 조용하게 모아 보여줍니다.</span>
            <button
              type="button"
              data-primary-action="true"
              onClick={onChooseRoot}
            >
              폴더 선택
            </button>
          </div>
        ) : isLoadingListing ? (
          <div className="folder-browser-message" role="status">
            <strong>파일 목록을 불러오고 있습니다</strong>
            <span>이 폴더의 Markdown과 이미지를 확인하는 중입니다.</span>
          </div>
        ) : rootListing?.status === "error" && !hasCachedEntries ? (
          <div className="folder-browser-message" role="alert">
            <strong>폴더를 읽지 못했습니다</strong>
            <span>{rootListing.error}</span>
            <button
              type="button"
              data-primary-action="true"
              onClick={onRefresh}
            >
              다시 시도
            </button>
          </div>
        ) : isEmpty ? (
          <div className="folder-browser-message">
            <FolderIcon />
            <strong>표시할 파일이 없습니다</strong>
            <span>이 폴더에는 지원하는 Markdown이나 이미지가 없습니다.</span>
          </div>
        ) : (
          <FolderTree
            state={state}
            currentDocumentPath={currentDocumentPath}
            isDocumentBusy={isDocumentBusy}
            onSelect={onSelectEntry}
            onToggleDirectory={onToggleDirectory}
            onRetryDirectory={onRetryDirectory}
            onOpenMarkdown={(entry) =>
              state.root && onOpenMarkdown(state.root.path, entry)
            }
            onOpenImage={onOpenImage}
          />
        )}
        {rootListing?.status === "loading" &&
        rootListing.entries.length > 0 ? (
          <p className="folder-browser-limit" role="status">
            파일 목록을 새로고침하고 있습니다.
          </p>
        ) : null}
        {rootListing?.status === "error" && hasCachedEntries ? (
          <p className="folder-browser-inline-error" role="alert">
            파일 목록을 새로고침하지 못했습니다: {rootListing.error}. 잠시 후
            자동으로 다시 시도합니다.
          </p>
        ) : null}
        {state.rootError || operationError ? (
          <p className="folder-browser-inline-error" role="alert">
            {operationError ?? state.rootError}
          </p>
        ) : null}
        {rootListing?.truncated ? (
          <p className="folder-browser-limit" role="status">
            항목이 많아 이 폴더의 일부만 표시합니다.
          </p>
        ) : null}
      </div>

      <footer className="document-sidebar-footer folder-browser-footer">
        {isPersistenceLimited ? (
          <p className="recent-document-storage-warning" role="status">
            폴더 탐색 상태를 저장할 수 없어 이번 실행에서만 유지됩니다.
          </p>
        ) : null}
        {state.root ? (
          <div className="folder-browser-root" title={state.root.path}>
            <span>{state.root.path}</span>
            <button
              type="button"
              aria-label="폴더 연결 해제"
              title="폴더 연결 해제"
              onClick={onClearRoot}
            >
              ×
            </button>
          </div>
        ) : null}
        {state.root ? (
          <div className="folder-browser-footer-actions">
            <button
              ref={changeFolderButtonRef}
              type="button"
              onClick={onChooseRoot}
            >
              <FolderIcon />
              폴더 변경
            </button>
          </div>
        ) : null}
      </footer>
    </aside>
  );
}
