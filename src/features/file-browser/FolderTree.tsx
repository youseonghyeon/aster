import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import type { FolderEntry } from "./folder-gateway";
import type { FolderTreeState } from "./folder-tree-state";
import { showFolderContextMenu } from "./folder-context-menu";

export type VisibleFolderEntry = FolderEntry & { level: number };
const folderTreePageSize = 300;
const maximumVisibleTreeEntries = 6_000;
const maximumVisualIndentLevel = 9;

export function flattenVisibleFolderEntries(
  state: FolderTreeState,
  maximumEntries = Number.POSITIVE_INFINITY,
): VisibleFolderEntry[] {
  const visible: VisibleFolderEntry[] = [];

  function appendDirectory(directory: string, level: number) {
    const listing = state.directories[directory];
    if (
      !listing ||
      (listing.status === "error" && listing.entries.length === 0)
    ) {
      return;
    }
    for (const entry of listing.entries) {
      if (visible.length >= maximumEntries) return;
      visible.push({ ...entry, level });
      if (
        entry.kind === "directory" &&
        state.expandedPaths.has(entry.relativePath)
      ) {
        appendDirectory(entry.relativePath, level + 1);
      }
    }
  }

  appendDirectory("", 1);
  return visible;
}

function parentPath(path: string) {
  const separator = path.lastIndexOf("/");
  return separator < 0 ? null : path.slice(0, separator);
}

function DisclosureIcon({ expanded }: { expanded: boolean }) {
  return (
    <svg
      className={`folder-tree-disclosure${expanded ? " is-expanded" : ""}`}
      viewBox="0 0 12 12"
      aria-hidden="true"
    >
      <path d="m4 2.75 3.25 3.25L4 9.25" />
    </svg>
  );
}

function EntryIcon({ kind }: Pick<FolderEntry, "kind">) {
  if (kind === "directory") {
    return (
      <svg viewBox="0 0 16 16" aria-hidden="true">
        <path d="M1.75 4.25h4l1.3 1.5h7.2v7.5H1.75z" />
      </svg>
    );
  }
  if (kind === "image") {
    return (
      <svg viewBox="0 0 16 16" aria-hidden="true">
        <rect x="2" y="2.5" width="12" height="11" rx="1.5" />
        <circle cx="5.25" cy="5.75" r="1" />
        <path d="m3.5 11 3-3 2 2 1.5-1.5 2.5 2.5" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true">
      <path d="M3 1.75h6l4 4v8.5H3z" />
      <path d="M9 1.75v4h4M5.25 9h5.5M5.25 11.5h4" />
    </svg>
  );
}

type FolderTreeProps = {
  state: FolderTreeState;
  currentDocumentPath: string | null;
  isDocumentBusy: boolean;
  onSelect: (path: string) => void;
  onToggleDirectory: (entry: FolderEntry) => void;
  onRetryDirectory: (directory: string) => void;
  onOpenMarkdown: (entry: FolderEntry) => void;
  onOpenImage: (entry: FolderEntry) => void;
  onRemoveFile: (entry: FolderEntry) => void;
  removingFilePath: string | null;
};

export function FolderTree({
  state,
  currentDocumentPath,
  isDocumentBusy,
  onSelect,
  onToggleDirectory,
  onRetryDirectory,
  onOpenMarkdown,
  onOpenImage,
  onRemoveFile,
  removingFilePath,
}: FolderTreeProps) {
  const allVisibleEntries = useMemo(
    () => flattenVisibleFolderEntries(state, maximumVisibleTreeEntries + 1),
    [state],
  );
  const isTreeCapped = allVisibleEntries.length > maximumVisibleTreeEntries;
  const visibleEntries = useMemo(
    () => allVisibleEntries.slice(0, maximumVisibleTreeEntries),
    [allVisibleEntries],
  );
  const [visiblePage, setVisiblePage] = useState(0);
  const pageCount = Math.max(
    1,
    Math.ceil(visibleEntries.length / folderTreePageSize),
  );
  const boundedVisiblePage = Math.min(visiblePage, pageCount - 1);
  const pageStart = boundedVisiblePage * folderTreePageSize;
  const renderedEntries = useMemo(
    () => visibleEntries.slice(pageStart, pageStart + folderTreePageSize),
    [pageStart, visibleEntries],
  );
  const entryByPath = useMemo(
    () => new Map(visibleEntries.map((entry) => [entry.relativePath, entry])),
    [visibleEntries],
  );
  const siblingPositionByPath = useMemo(() => {
    const groups = new Map<string, VisibleFolderEntry[]>();
    for (const entry of visibleEntries) {
      const groupKey = `${entry.level}:${parentPath(entry.relativePath) ?? ""}`;
      const group = groups.get(groupKey) ?? [];
      group.push(entry);
      groups.set(groupKey, group);
    }
    const positions = new Map<string, { position: number; size: number }>();
    for (const siblings of groups.values()) {
      siblings.forEach((entry, index) =>
        positions.set(entry.relativePath, {
          position: index + 1,
          size: siblings.length,
        }),
      );
    }
    return positions;
  }, [visibleEntries]);
  const pendingFocusPathRef = useRef<string | null>(null);
  const lastActiveIndexRef = useRef(0);
  const hasTreeFocusRef = useRef(false);
  const [activePath, setActivePath] = useState<string | null>(null);
  const entryRefs = useRef(new Map<string, HTMLElement>());
  const typeaheadRef = useRef({ value: "", timer: 0 });

  useEffect(() => setVisiblePage(0), [state.root?.token]);

  useEffect(() => {
    if (visiblePage === boundedVisiblePage) return;
    setVisiblePage(boundedVisiblePage);
  }, [boundedVisiblePage, visiblePage]);

  useLayoutEffect(() => {
    if (visibleEntries.length === 0) {
      setActivePath(null);
      return;
    }

    const existingIndex = activePath
      ? visibleEntries.findIndex((entry) => entry.relativePath === activePath)
      : -1;
    if (existingIndex >= 0) {
      lastActiveIndexRef.current = existingIndex;
      const targetPage = Math.floor(existingIndex / folderTreePageSize);
      if (targetPage !== boundedVisiblePage) {
        if (hasTreeFocusRef.current) pendingFocusPathRef.current = activePath;
        setVisiblePage(targetPage);
      }
      return;
    }

    const preferredPath =
      (state.selectedPath && entryByPath.has(state.selectedPath)
        ? state.selectedPath
        : visibleEntries.find((entry) => entry.path === currentDocumentPath)
            ?.relativePath) ??
      visibleEntries[
        Math.min(lastActiveIndexRef.current, visibleEntries.length - 1)
      ].relativePath;
    const preferredIndex = visibleEntries.findIndex(
      (entry) => entry.relativePath === preferredPath,
    );
    lastActiveIndexRef.current = preferredIndex;
    setActivePath(preferredPath);
    const targetPage = Math.floor(preferredIndex / folderTreePageSize);
    if (hasTreeFocusRef.current) {
      pendingFocusPathRef.current = preferredPath;
      onSelect(preferredPath);
    }
    if (targetPage !== boundedVisiblePage) setVisiblePage(targetPage);
  }, [
    activePath,
    boundedVisiblePage,
    currentDocumentPath,
    entryByPath,
    onSelect,
    state.selectedPath,
    visibleEntries,
  ]);

  useLayoutEffect(() => {
    const path = pendingFocusPathRef.current;
    if (!path) return;
    const element = entryRefs.current.get(path);
    if (!element) return;
    pendingFocusPathRef.current = null;
    element.focus();
    element.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [renderedEntries]);

  function focusEntry(path: string) {
    const index = visibleEntries.findIndex(
      (entry) => entry.relativePath === path,
    );
    if (index < 0) return;
    lastActiveIndexRef.current = index;
    setActivePath(path);
    onSelect(path);
    const targetPage = Math.floor(index / folderTreePageSize);
    if (targetPage !== boundedVisiblePage) {
      pendingFocusPathRef.current = path;
      setVisiblePage(targetPage);
      return;
    }
    const element = entryRefs.current.get(path);
    element?.focus();
    element?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }

  function showPage(page: number) {
    const nextPage = Math.min(pageCount - 1, Math.max(0, page));
    const firstEntry = visibleEntries[nextPage * folderTreePageSize];
    if (firstEntry) focusEntry(firstEntry.relativePath);
  }

  function activateEntry(entry: FolderEntry) {
    if (entry.kind === "directory") {
      const directory = state.directories[entry.relativePath];
      if (
        state.expandedPaths.has(entry.relativePath) &&
        directory?.status === "error"
      ) {
        onRetryDirectory(entry.relativePath);
      } else {
        onToggleDirectory(entry);
      }
    } else if (!isDocumentBusy && entry.kind === "markdown") {
      onOpenMarkdown(entry);
    } else if (!isDocumentBusy) {
      onOpenImage(entry);
    }
  }

  function openContextMenu(
    entry: FolderEntry,
    x: number,
    y: number,
  ) {
    setActivePath(entry.relativePath);
    onSelect(entry.relativePath);
    void showFolderContextMenu({
      entry,
      x,
      y,
      canRemoveFile:
        !isDocumentBusy && removingFilePath !== entry.relativePath,
      onReload: () => window.location.reload(),
      onRemoveFile: () => onRemoveFile(entry),
    }).catch((error) => {
      console.error("파일 문맥 메뉴를 열지 못했습니다.", error);
    });
  }

  function handleKeyDown(
    event: KeyboardEvent<HTMLElement>,
    entry: VisibleFolderEntry,
  ) {
    if (
      event.key === "ContextMenu" ||
      (event.key === "F10" && event.shiftKey)
    ) {
      event.preventDefault();
      const bounds = event.currentTarget.getBoundingClientRect();
      openContextMenu(entry, bounds.left + 24, bounds.top + bounds.height);
      return;
    }
    const index = visibleEntries.findIndex(
      (candidate) => candidate.relativePath === entry.relativePath,
    );
    let target: VisibleFolderEntry | undefined;
    if (event.key === "ArrowDown") target = visibleEntries[index + 1];
    else if (event.key === "ArrowUp") target = visibleEntries[index - 1];
    else if (event.key === "Home") target = visibleEntries[0];
    else if (event.key === "End") {
      target = visibleEntries[visibleEntries.length - 1];
    } else if (event.key === "ArrowRight" && entry.kind === "directory") {
      if (!state.expandedPaths.has(entry.relativePath)) {
        event.preventDefault();
        onToggleDirectory(entry);
        return;
      }
      const child = visibleEntries[index + 1];
      if (child?.level === entry.level + 1) target = child;
    } else if (event.key === "ArrowLeft") {
      if (
        entry.kind === "directory" &&
        state.expandedPaths.has(entry.relativePath)
      ) {
        event.preventDefault();
        onToggleDirectory(entry);
        return;
      }
      const parent = parentPath(entry.relativePath);
      if (parent) target = entryByPath.get(parent);
    } else if (event.key === "Enter") {
      event.preventDefault();
      activateEntry(entry);
      return;
    } else if (event.key === " ") {
      event.preventDefault();
      onSelect(entry.relativePath);
      return;
    } else if (
      event.key.length === 1 &&
      !event.metaKey &&
      !event.ctrlKey &&
      !event.altKey
    ) {
      window.clearTimeout(typeaheadRef.current.timer);
      typeaheadRef.current.value += event.key.toLocaleLowerCase();
      const query = typeaheadRef.current.value;
      target = [
        ...visibleEntries.slice(index + 1),
        ...visibleEntries.slice(0, index + 1),
      ].find(
        (candidate) => candidate.name.toLocaleLowerCase().startsWith(query),
      );
      typeaheadRef.current.timer = window.setTimeout(() => {
        typeaheadRef.current.value = "";
      }, 600);
    }
    if (target) {
      event.preventDefault();
      focusEntry(target.relativePath);
    }
  }

  if (visibleEntries.length === 0) return null;

  return (
    <div className="folder-tree-frame">
      <div className="folder-tree-viewport">
        <div
          className="folder-tree"
          role="tree"
          aria-label="폴더 파일"
          onFocusCapture={() => {
            hasTreeFocusRef.current = true;
          }}
          onBlurCapture={(event) => {
            if (
              event.relatedTarget instanceof Node &&
              !event.currentTarget.contains(event.relatedTarget)
            ) {
              hasTreeFocusRef.current = false;
            }
          }}
        >
          {renderedEntries.map((entry) => {
            const isDirectory = entry.kind === "directory";
            const isExpanded =
              isDirectory && state.expandedPaths.has(entry.relativePath);
            const directory = isDirectory
              ? state.directories[entry.relativePath]
              : undefined;
            const isSelected = state.selectedPath === entry.relativePath;
            const isCurrent = entry.path === currentDocumentPath;
            const siblingPosition = siblingPositionByPath.get(
              entry.relativePath,
            );
            const statusLabel =
              directory?.status === "loading"
                ? ", 불러오는 중"
                : directory?.status === "error"
                  ? `, 읽기 오류: ${directory.error}. Enter로 다시 시도`
                  : directory?.truncated
                    ? ", 일부 항목만 표시"
                    : "";
            return (
              <div
                key={entry.relativePath}
                ref={(element) => {
                  if (element) {
                    entryRefs.current.set(entry.relativePath, element);
                  } else {
                    entryRefs.current.delete(entry.relativePath);
                  }
                }}
                role="treeitem"
                className={`folder-tree-item is-${entry.kind}`}
                style={{
                  paddingInlineStart: `${8 + Math.min(entry.level - 1, maximumVisualIndentLevel - 1) * 16}px`,
                }}
                tabIndex={activePath === entry.relativePath ? 0 : -1}
                aria-level={entry.level}
                aria-posinset={siblingPosition?.position}
                aria-setsize={siblingPosition?.size}
                aria-expanded={isDirectory ? isExpanded : undefined}
                aria-selected={isSelected}
                aria-current={isCurrent ? "page" : undefined}
                aria-haspopup="menu"
                aria-label={`${entry.name}${isCurrent ? ", 현재 문서" : ""}${statusLabel}`}
                title={
                  directory?.error
                    ? `${entry.path}\n${directory.error}`
                    : entry.path
                }
                onFocus={() => {
                  lastActiveIndexRef.current = visibleEntries.findIndex(
                    (candidate) =>
                      candidate.relativePath === entry.relativePath,
                  );
                  setActivePath(entry.relativePath);
                }}
                onClick={() => {
                  setActivePath(entry.relativePath);
                  onSelect(entry.relativePath);
                }}
                onDoubleClick={(event) => {
                  if (
                    event.target instanceof Element &&
                    event.target.closest(".folder-tree-disclosure-button")
                  ) {
                    return;
                  }
                  event.preventDefault();
                  activateEntry(entry);
                }}
                onContextMenu={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  openContextMenu(entry, event.clientX, event.clientY);
                }}
                onKeyDown={(event) => handleKeyDown(event, entry)}
              >
                {isDirectory ? (
                  <button
                    type="button"
                    className="folder-tree-disclosure-button"
                    tabIndex={-1}
                    aria-expanded={isExpanded}
                    aria-label={`${entry.name} 폴더 ${isExpanded ? "접기" : "펼치기"}`}
                    title={isExpanded ? "폴더 접기" : "폴더 펼치기"}
                    onPointerDown={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                    }}
                    onClick={(event) => {
                      event.stopPropagation();
                      if (event.detail > 1) return;
                      entryRefs.current
                        .get(entry.relativePath)
                        ?.focus({ preventScroll: true });
                      setActivePath(entry.relativePath);
                      onToggleDirectory(entry);
                    }}
                    onDoubleClick={(event) => event.stopPropagation()}
                  >
                    <DisclosureIcon expanded={isExpanded} />
                  </button>
                ) : (
                  <span
                    className="folder-tree-disclosure-placeholder"
                    aria-hidden="true"
                  />
                )}
                <span className="folder-tree-icon" aria-hidden="true">
                  <EntryIcon kind={entry.kind} />
                </span>
                <span className="folder-tree-name">{entry.name}</span>
                {directory?.status === "loading" ? (
                  <span className="folder-tree-state" aria-hidden="true">
                    …
                  </span>
                ) : directory?.status === "error" ? (
                  <span
                    className="folder-tree-state is-error"
                    aria-hidden="true"
                  >
                    읽기 오류
                  </span>
                ) : directory?.truncated ? (
                  <span className="folder-tree-state" aria-hidden="true">
                    +
                  </span>
                ) : null}
              </div>
            );
          })}
        </div>
      </div>
      {pageCount > 1 ? (
        <div
          className="folder-tree-pagination"
          role="group"
          aria-label="파일 목록 페이지"
        >
          <button
            type="button"
            className="folder-tree-more"
            disabled={boundedVisiblePage === 0}
            onClick={() => showPage(boundedVisiblePage - 1)}
          >
            이전
          </button>
          <span
            className="folder-tree-page-status"
            aria-label={`${pageCount}페이지 중 ${boundedVisiblePage + 1}페이지`}
            aria-live="polite"
          >
            {boundedVisiblePage + 1} / {pageCount}
          </span>
          <button
            type="button"
            className="folder-tree-more"
            disabled={boundedVisiblePage === pageCount - 1}
            onClick={() => showPage(boundedVisiblePage + 1)}
          >
            다음
          </button>
        </div>
      ) : null}
      {isTreeCapped ? (
        <p className="folder-browser-limit" role="status">
          열린 가지가 많아 처음{
            " "
          }{maximumVisibleTreeEntries.toLocaleString("ko-KR")}개만 표시합니다.
          사용하지 않는 폴더를 접어 주세요.
        </p>
      ) : null}
    </div>
  );
}
