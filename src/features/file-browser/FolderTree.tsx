import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import type { FolderEntry } from "./folder-gateway";
import type { FolderTreeState } from "./folder-tree-state";

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
    if (!listing || listing.status === "error") return;
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
  const [visibleLimit, setVisibleLimit] = useState(folderTreePageSize);
  const renderedEntries = useMemo(
    () => visibleEntries.slice(0, visibleLimit),
    [visibleEntries, visibleLimit],
  );
  const entryByPath = useMemo(
    () => new Map(renderedEntries.map((entry) => [entry.relativePath, entry])),
    [renderedEntries],
  );
  const [activePath, setActivePath] = useState<string | null>(null);
  const buttonRefs = useRef(new Map<string, HTMLButtonElement>());
  const typeaheadRef = useRef({ value: "", timer: 0 });

  useEffect(() => {
    if (activePath && entryByPath.has(activePath)) return;
    const next =
      (state.selectedPath && entryByPath.has(state.selectedPath)
        ? state.selectedPath
        : renderedEntries.find((entry) => entry.path === currentDocumentPath)
            ?.relativePath) ??
      renderedEntries[0]?.relativePath ??
      null;
    setActivePath(next);
  }, [
    activePath,
    currentDocumentPath,
    entryByPath,
    renderedEntries,
    state.selectedPath,
  ]);

  useEffect(() => setVisibleLimit(folderTreePageSize), [state.root?.token]);

  function focusEntry(path: string) {
    setActivePath(path);
    onSelect(path);
    buttonRefs.current.get(path)?.focus({ preventScroll: true });
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

  function handleKeyDown(
    event: KeyboardEvent<HTMLButtonElement>,
    entry: VisibleFolderEntry,
  ) {
    const index = renderedEntries.findIndex(
      (candidate) => candidate.relativePath === entry.relativePath,
    );
    let target: VisibleFolderEntry | undefined;
    if (event.key === "ArrowDown") target = renderedEntries[index + 1];
    else if (event.key === "ArrowUp") target = renderedEntries[index - 1];
    else if (event.key === "Home") target = renderedEntries[0];
    else if (event.key === "End") {
      target = renderedEntries[renderedEntries.length - 1];
    }
    else if (event.key === "ArrowRight" && entry.kind === "directory") {
      if (!state.expandedPaths.has(entry.relativePath)) {
        event.preventDefault();
        onToggleDirectory(entry);
        return;
      }
      const child = renderedEntries[index + 1];
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
        ...renderedEntries.slice(index + 1),
        ...renderedEntries.slice(0, index + 1),
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
      <div className="folder-tree" role="tree" aria-label="폴더 파일">
        {renderedEntries.map((entry) => {
          const isDirectory = entry.kind === "directory";
          const isExpanded =
            isDirectory && state.expandedPaths.has(entry.relativePath);
          const directory = isDirectory
            ? state.directories[entry.relativePath]
            : undefined;
          const isSelected = state.selectedPath === entry.relativePath;
          const isCurrent = entry.path === currentDocumentPath;
          const statusLabel =
            directory?.status === "loading"
              ? ", 불러오는 중"
              : directory?.status === "error"
                ? `, 읽기 오류: ${directory.error}. Enter로 다시 시도`
                : directory?.truncated
                  ? ", 일부 항목만 표시"
                  : "";
          return (
            <button
            key={entry.relativePath}
            ref={(element) => {
              if (element) buttonRefs.current.set(entry.relativePath, element);
              else buttonRefs.current.delete(entry.relativePath);
            }}
            type="button"
            role="treeitem"
            className={`folder-tree-item is-${entry.kind}`}
            style={{
              paddingInlineStart: `${8 + Math.min(entry.level - 1, maximumVisualIndentLevel - 1) * 16}px`,
            }}
            tabIndex={activePath === entry.relativePath ? 0 : -1}
            aria-level={entry.level}
            aria-expanded={isDirectory ? isExpanded : undefined}
            aria-selected={isSelected}
            aria-current={isCurrent ? "page" : undefined}
            aria-label={`${entry.name}${isCurrent ? ", 현재 문서" : ""}${statusLabel}`}
            title={
              directory?.error
                ? `${entry.path}\n${directory.error}`
                : entry.path
            }
            onFocus={() => setActivePath(entry.relativePath)}
            onClick={() => {
              setActivePath(entry.relativePath);
              onSelect(entry.relativePath);
            }}
            onDoubleClick={() => activateEntry(entry)}
            onKeyDown={(event) => handleKeyDown(event, entry)}
          >
            <span className="folder-tree-leading" aria-hidden="true">
              {isDirectory ? <DisclosureIcon expanded={isExpanded} /> : <span />}
              <span className="folder-tree-icon">
                <EntryIcon kind={entry.kind} />
              </span>
            </span>
            <span className="folder-tree-name">{entry.name}</span>
            {directory?.status === "loading" ? (
              <span className="folder-tree-state" aria-hidden="true">…</span>
            ) : directory?.status === "error" ? (
              <span className="folder-tree-state is-error" aria-hidden="true">
                다시 시도
              </span>
            ) : directory?.truncated ? (
              <span className="folder-tree-state" aria-hidden="true">+</span>
            ) : null}
            </button>
          );
        })}
      </div>
      {visibleEntries.length > renderedEntries.length ? (
        <button
          type="button"
          className="folder-tree-more"
          onClick={() => setVisibleLimit((limit) => limit + folderTreePageSize)}
        >
          다음{
            " "
          }{Math.min(folderTreePageSize, visibleEntries.length - renderedEntries.length)}개 표시
        </button>
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
