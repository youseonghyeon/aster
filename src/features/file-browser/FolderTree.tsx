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

export function flattenVisibleFolderEntries(
  state: FolderTreeState,
): VisibleFolderEntry[] {
  const visible: VisibleFolderEntry[] = [];

  function appendDirectory(directory: string, level: number) {
    const listing = state.directories[directory];
    if (!listing || listing.status === "error") return;
    for (const entry of listing.entries) {
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
  onOpenMarkdown: (path: string) => void;
  onOpenImage: (entry: FolderEntry) => void;
};

export function FolderTree({
  state,
  currentDocumentPath,
  isDocumentBusy,
  onSelect,
  onToggleDirectory,
  onOpenMarkdown,
  onOpenImage,
}: FolderTreeProps) {
  const visibleEntries = useMemo(
    () => flattenVisibleFolderEntries(state),
    [state],
  );
  const entryByPath = useMemo(
    () => new Map(visibleEntries.map((entry) => [entry.relativePath, entry])),
    [visibleEntries],
  );
  const [activePath, setActivePath] = useState<string | null>(null);
  const buttonRefs = useRef(new Map<string, HTMLButtonElement>());
  const typeaheadRef = useRef({ value: "", timer: 0 });

  useEffect(() => {
    if (activePath && entryByPath.has(activePath)) return;
    const next =
      (state.selectedPath && entryByPath.has(state.selectedPath)
        ? state.selectedPath
        : visibleEntries.find((entry) => entry.path === currentDocumentPath)
            ?.relativePath) ??
      visibleEntries[0]?.relativePath ??
      null;
    setActivePath(next);
  }, [activePath, currentDocumentPath, entryByPath, state.selectedPath, visibleEntries]);

  function focusEntry(path: string) {
    setActivePath(path);
    onSelect(path);
    buttonRefs.current.get(path)?.focus({ preventScroll: true });
  }

  function activateEntry(entry: FolderEntry) {
    if (entry.kind === "directory") onToggleDirectory(entry);
    else if (!isDocumentBusy && entry.kind === "markdown") {
      onOpenMarkdown(entry.path);
    } else if (!isDocumentBusy) {
      onOpenImage(entry);
    }
  }

  function handleKeyDown(
    event: KeyboardEvent<HTMLButtonElement>,
    entry: VisibleFolderEntry,
  ) {
    const index = visibleEntries.findIndex(
      (candidate) => candidate.relativePath === entry.relativePath,
    );
    let target: VisibleFolderEntry | undefined;
    if (event.key === "ArrowDown") target = visibleEntries[index + 1];
    else if (event.key === "ArrowUp") target = visibleEntries[index - 1];
    else if (event.key === "Home") target = visibleEntries[0];
    else if (event.key === "End") target = visibleEntries[visibleEntries.length - 1];
    else if (event.key === "ArrowRight" && entry.kind === "directory") {
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
      target = [...visibleEntries.slice(index + 1), ...visibleEntries.slice(0, index + 1)].find(
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
    <div className="folder-tree" role="tree" aria-label="폴더 파일">
      {visibleEntries.map((entry) => {
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
              ? ", 읽기 오류"
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
            style={{ paddingInlineStart: `${8 + (entry.level - 1) * 16}px` }}
            tabIndex={activePath === entry.relativePath ? 0 : -1}
            aria-level={entry.level}
            aria-expanded={isDirectory ? isExpanded : undefined}
            aria-selected={isSelected}
            aria-current={isCurrent ? "page" : undefined}
            aria-label={`${entry.name}${isCurrent ? ", 현재 문서" : ""}${statusLabel}`}
            title={entry.path}
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
              <span className="folder-tree-state is-error" aria-hidden="true">!</span>
            ) : directory?.truncated ? (
              <span className="folder-tree-state" aria-hidden="true">+</span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
