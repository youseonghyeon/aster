import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import { isTauri } from "@tauri-apps/api/core";
import { showOutlineContextMenu } from "./outline-context-menu";
import type { MarkdownOutlineItem } from "../../lib/markdown-outline";
import { useTransientScrollbar } from "../../hooks/useTransientScrollbar";
import "./DocumentOutline.css";

type OutlineTreeItem = MarkdownOutlineItem & {
  children: OutlineTreeItem[];
};

type DocumentOutlineProps = {
  items: MarkdownOutlineItem[];
  activeHeadingId: string | null;
  documentKey: string;
  isModal: boolean;
  onClose: () => void;
  onNavigate: (headingId: string, shouldMoveFocus: boolean) => void;
};

function SearchIcon() {
  return (
    <svg viewBox="0 0 18 18" aria-hidden="true">
      <circle cx="7.75" cy="7.75" r="4.75" />
      <path d="m11.25 11.25 3.5 3.5" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg viewBox="0 0 18 18" aria-hidden="true">
      <path d="m4.5 4.5 9 9m0-9-9 9" />
    </svg>
  );
}

function buildOutlineTree(items: MarkdownOutlineItem[]) {
  const roots: OutlineTreeItem[] = [];
  const ancestors: OutlineTreeItem[] = [];

  for (const item of items) {
    const treeItem = { ...item, children: [] } satisfies OutlineTreeItem;

    while (
      ancestors.length > 0 &&
      ancestors[ancestors.length - 1].depth >= item.depth
    ) {
      ancestors.pop();
    }

    const parent = ancestors[ancestors.length - 1];

    if (parent) {
      parent.children.push(treeItem);
    } else {
      roots.push(treeItem);
    }

    ancestors.push(treeItem);
  }

  return roots;
}

function filterOutlineTree(
  items: OutlineTreeItem[],
  normalizedQuery: string,
): OutlineTreeItem[] {
  if (!normalizedQuery) {
    return items;
  }

  return items.flatMap<OutlineTreeItem>((item) => {
    const children = filterOutlineTree(item.children, normalizedQuery);
    const isMatch = item.title.toLocaleLowerCase().includes(normalizedQuery);

    return isMatch || children.length > 0 ? [{ ...item, children }] : [];
  });
}

function OutlineList({
  items,
  activeHeadingId,
  onNavigate,
}: {
  items: OutlineTreeItem[];
  activeHeadingId: string | null;
  onNavigate: (headingId: string, shouldMoveFocus: boolean) => void;
}) {
  return (
    <ol className="outline-list">
      {items.map((item) => {
        const isActive = item.id === activeHeadingId;

        return (
          <li key={item.id} className="outline-list-item">
            <button
              type="button"
              className="outline-link"
              aria-current={isActive ? "location" : undefined}
              title={item.title}
              onClick={(event) => onNavigate(item.id, event.detail === 0)}
            >
              <span className="outline-link-label">{item.title}</span>
            </button>
            {item.children.length > 0 ? (
              <OutlineList
                items={item.children}
                activeHeadingId={activeHeadingId}
                onNavigate={onNavigate}
              />
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}

export function DocumentOutline({
  items,
  activeHeadingId,
  documentKey,
  isModal,
  onClose,
  onNavigate,
}: DocumentOutlineProps) {
  const scrollbarRef = useTransientScrollbar("overlay");
  const [query, setQuery] = useState("");
  const outlineRef = useRef<HTMLElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const outlineTree = useMemo(() => buildOutlineTree(items), [items]);
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const filteredTree = useMemo(
    () => filterOutlineTree(outlineTree, normalizedQuery),
    [normalizedQuery, outlineTree],
  );
  const matchingCount = useMemo(
    () =>
      normalizedQuery
        ? items.filter((item) =>
            item.title.toLocaleLowerCase().includes(normalizedQuery),
          ).length
        : items.length,
    [items, normalizedQuery],
  );

  useEffect(() => {
    searchInputRef.current?.focus();
  }, []);

  useEffect(() => {
    if (
      isModal &&
      !outlineRef.current?.contains(document.activeElement)
    ) {
      searchInputRef.current?.focus();
    }
  }, [isModal]);

  useEffect(() => {
    setQuery("");
  }, [documentKey]);

  function openOutlineMenu(target: HTMLElement, x: number, y: number) {
    void showOutlineContextMenu(target, x, y).catch((error: unknown) => {
      // Keep keyboard editing/copy available if a native menu cannot be opened.
      console.error("목차 메뉴를 열지 못했습니다.", error);
    });
  }

  function handleKeyDown(event: KeyboardEvent<HTMLElement>) {
    if (isTauri() && (event.key === "ContextMenu" || (event.key === "F10" && event.shiftKey))) {
      event.preventDefault();
      event.stopPropagation();
      const target = event.target instanceof HTMLElement ? event.target : event.currentTarget;
      const bounds = target.getBoundingClientRect();
      openOutlineMenu(target, bounds.left + 12, bounds.bottom);
      return;
    }
    if (!isModal || event.key !== "Tab") {
      return;
    }

    const focusableElements = Array.from(
      outlineRef.current?.querySelectorAll<HTMLElement>(
        'button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"]):not([hidden])',
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
      ref={outlineRef}
      id="document-outline"
      className="document-outline"
      role={isModal ? "dialog" : undefined}
      aria-modal={isModal ? true : undefined}
      aria-labelledby="document-outline-title"
      onKeyDown={handleKeyDown}
      onContextMenu={(event) => {
        if (!isTauri()) return;
        event.preventDefault();
        event.stopPropagation();
        const target = event.target instanceof HTMLElement ? event.target : event.currentTarget;
        openOutlineMenu(target, event.clientX, event.clientY);
      }}
    >
      <header className="document-outline-header">
        <div>
          <span className="document-outline-eyebrow">탐색</span>
          <h2 id="document-outline-title">문서 목차</h2>
        </div>
        <button
          type="button"
          className="outline-close-button"
          aria-label="목차 닫기"
          title="목차 닫기"
          onClick={onClose}
        >
          <CloseIcon />
        </button>
      </header>

      <div className="outline-search">
        <label className="visually-hidden" htmlFor="outline-search-input">
          목차 제목 검색
        </label>
        <SearchIcon />
        <input
          ref={searchInputRef}
          id="outline-search-input"
          name="outline-search"
          type="search"
          value={query}
          placeholder="제목 검색…"
          autoComplete="off"
          onChange={(event) => setQuery(event.currentTarget.value)}
        />
        <span className="outline-result-count" aria-live="polite">
          {normalizedQuery ? `${matchingCount}개` : `${items.length}`}
        </span>
      </div>

      <div className="overlay-scroll-frame reserved-scroll-frame outline-scroll-frame">
        <nav ref={scrollbarRef} className="outline-navigation" aria-label="문서 제목">
          {items.length === 0 ? (
            <div className="outline-empty-state">
              <strong>표시할 제목이 없습니다</strong>
              <span>Markdown 제목을 추가하면 이곳에 구조가 나타납니다.</span>
            </div>
          ) : filteredTree.length === 0 ? (
            <div className="outline-empty-state">
              <strong>일치하는 제목이 없습니다</strong>
              <span>다른 검색어를 입력해 보세요.</span>
            </div>
          ) : (
            <OutlineList
              items={filteredTree}
              activeHeadingId={activeHeadingId}
              onNavigate={onNavigate}
            />
          )}
        </nav>
        <div className="overlay-scrollbar-host" />
      </div>
    </aside>
  );
}
