import { useCallback, useEffect, useRef, useState } from "react";
import type {
  AppEventChannel,
  DocumentOpenOutcome,
} from "../shared/app-events";
import {
  classifyMarkdownLink,
  decodeRelativeAssetPath,
} from "../lib/markdown-links";
import { findMarkdownFragmentTarget } from "../lib/markdown-fragment-target";
import { showMarkdownMessage } from "../features/documents/markdown-files";
import {
  openExternalLink,
  readRelativeImage,
  resolveRelativeMarkdownPath,
} from "./link-navigation-gateway";

type NavigationEntry = {
  path: string;
  anchor: string | null;
  scrollTop: number | null;
};

type NavigationHistory = {
  entries: NavigationEntry[];
  index: number;
};

type UseLinkNavigationControllerOptions = {
  events: AppEventChannel;
  documentPath: string | null;
  previewDocumentPath: string | null;
  previewElement: HTMLDivElement | null;
  openDocument: (
    path: string,
    source: "link" | "history",
  ) => Promise<DocumentOpenOutcome>;
};

const emptyHistory: NavigationHistory = { entries: [], index: -1 };

export function useLinkNavigationController({
  events,
  documentPath,
  previewDocumentPath,
  previewElement,
  openDocument,
}: UseLinkNavigationControllerOptions) {
  const historyRef = useRef<NavigationHistory>(emptyHistory);
  const mountedRef = useRef(true);
  const documentPathRef = useRef(documentPath);
  const previewElementRef = useRef(previewElement);
  const observedPathRef = useRef<string | null>(null);
  const committedOpenPathRef = useRef<string | null>(null);
  const pendingPathRef = useRef<string | null>(null);
  const restoreTokenRef = useRef(0);
  const isNavigatingRef = useRef(false);
  const [controls, setControls] = useState({ canGoBack: false, canGoForward: false });
  documentPathRef.current = documentPath;
  previewElementRef.current = previewElement;

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(
    () =>
      events.subscribe("document-committed", ({ kind, path }) => {
        if (kind === "open") committedOpenPathRef.current = path;
      }),
    [events],
  );

  const setPreviewScrollTop = useCallback(
    (element: HTMLDivElement, top: number) => {
      if (typeof element.scrollTo === "function") {
        element.scrollTo({ top, behavior: "auto" });
      } else {
        element.scrollTop = top;
      }
    },
    [],
  );

  const commitHistory = useCallback((history: NavigationHistory) => {
    historyRef.current = history;
    setControls({
      canGoBack: history.index > 0,
      canGoForward: history.index >= 0 && history.index < history.entries.length - 1,
    });
  }, []);

  const captureCurrentScroll = useCallback(() => {
    const history = historyRef.current;
    const entry = history.entries[history.index];
    const element = previewElementRef.current;
    if (!entry || !element || element.dataset.documentPath !== entry.path) return history;
    const entries = history.entries.slice();
    entries[history.index] = { ...entry, scrollTop: element.scrollTop };
    const next = { entries, index: history.index };
    historyRef.current = next;
    return next;
  }, []);

  const pushEntry = useCallback(
    (entry: NavigationEntry) => {
      const current = captureCurrentScroll();
      const entries = current.entries.slice(0, current.index + 1);
      entries.push(entry);
      commitHistory({ entries, index: entries.length - 1 });
    },
    [captureCurrentScroll, commitHistory],
  );

  const reportError = useCallback(async (error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    await showMarkdownMessage(message, {
      title: "링크를 열 수 없습니다",
      kind: "error",
    }).catch(() => console.error("링크를 열 수 없습니다:", message));
  }, []);

  const restoreEntry = useCallback(
    (entry: NavigationEntry, preferSavedScroll: boolean) => {
      const restoreToken = ++restoreTokenRef.current;
      let attempts = 0;
      const restore = () => {
        if (!mountedRef.current || restoreToken !== restoreTokenRef.current) return;
        const element = previewElementRef.current;
        if (!element || element.dataset.documentPath !== entry.path) {
          if (attempts++ < 24) window.requestAnimationFrame(restore);
          return;
        }

        if (preferSavedScroll && entry.scrollTop !== null) {
          setPreviewScrollTop(element, entry.scrollTop);
          element.focus({ preventScroll: true });
          return;
        }

        if (!entry.anchor) {
          setPreviewScrollTop(element, 0);
          element.focus({ preventScroll: true });
          return;
        }

        const target = findMarkdownFragmentTarget(element, entry.anchor);
        if (!target) {
          if (attempts++ < 24) {
            window.requestAnimationFrame(restore);
            return;
          }

          const history = historyRef.current;
          const currentEntry = history.entries[history.index];
          if (currentEntry === entry) {
            const entries = history.entries.slice();
            entries[history.index] = {
              ...currentEntry,
              anchor: null,
              scrollTop: 0,
            };
            historyRef.current = { entries, index: history.index };
          }
          setPreviewScrollTop(element, 0);
          element.focus({ preventScroll: true });
          void reportError(`문서에서 “${entry.anchor}” 앵커를 찾을 수 없습니다.`);
          return;
        }
        const top =
          element.scrollTop +
          target.getBoundingClientRect().top -
          element.getBoundingClientRect().top -
          32;
        setPreviewScrollTop(element, Math.max(0, top));
        target.focus({ preventScroll: true });
      };
      window.requestAnimationFrame(restore);
    },
    [reportError, setPreviewScrollTop],
  );

  useEffect(() => {
    if (documentPath === observedPathRef.current) return;
    observedPathRef.current = documentPath;
    if (!documentPath) {
      commitHistory(emptyHistory);
      return;
    }
    if (pendingPathRef.current === documentPath) {
      committedOpenPathRef.current = null;
      return;
    }
    const wasDocumentOpen = committedOpenPathRef.current === documentPath;
    committedOpenPathRef.current = null;
    const entry = {
      path: documentPath,
      anchor: null,
      scrollTop: wasDocumentOpen ? null : (previewElementRef.current?.scrollTop ?? 0),
    };
    pushEntry(entry);
    if (wasDocumentOpen) restoreEntry(entry, false);
  }, [commitHistory, documentPath, pushEntry, restoreEntry]);

  useEffect(() => {
    if (!previewElement) return;
    const capture = () => {
      const history = historyRef.current;
      const entry = history.entries[history.index];
      if (!entry || previewElement.dataset.documentPath !== entry.path) return;
      history.entries[history.index] = {
        ...entry,
        scrollTop: previewElement.scrollTop,
      };
    };
    previewElement.addEventListener("scroll", capture, { passive: true });
    return () => previewElement.removeEventListener("scroll", capture);
  }, [previewElement]);

  const navigateToEntry = useCallback(
    async (targetIndex: number) => {
      const current = captureCurrentScroll();
      const entry = current.entries[targetIndex];
      if (!entry || isNavigatingRef.current) return;

      if (entry.path === documentPathRef.current) {
        commitHistory({ entries: current.entries, index: targetIndex });
        restoreEntry(entry, true);
        return;
      }

      isNavigatingRef.current = true;
      pendingPathRef.current = entry.path;
      try {
        const outcome = await openDocument(entry.path, "history");
        if (outcome === "opened" || outcome === "current") {
          observedPathRef.current = entry.path;
          commitHistory({ entries: current.entries, index: targetIndex });
          restoreEntry(entry, true);
        }
      } catch (error) {
        await reportError(error);
      } finally {
        pendingPathRef.current = null;
        isNavigatingRef.current = false;
      }
    },
    [captureCurrentScroll, commitHistory, openDocument, reportError, restoreEntry],
  );

  const activateLink = useCallback(
    async (href: string) => {
      const target = classifyMarkdownLink(href);
      if (target.kind === "unsupported") {
        await reportError(target.reason);
        return;
      }
      if (target.kind === "external") {
        try {
          await openExternalLink(target.url);
        } catch (error) {
          await reportError(error);
        }
        return;
      }
      if (target.kind === "anchor") {
        const anchor = target.anchor;
        const path = documentPathRef.current;
        if (!path) {
          const element = previewElementRef.current;
          if (!anchor && element) setPreviewScrollTop(element, 0);
          else {
            const fragmentTarget =
              element && anchor
                ? findMarkdownFragmentTarget(element, anchor)
                : null;
            if (anchor && !fragmentTarget) {
              await reportError(
                `문서에서 “${anchor}” 앵커를 찾을 수 없습니다.`,
              );
              return;
            }
            fragmentTarget?.scrollIntoView({ block: "start" });
            fragmentTarget?.focus({ preventScroll: true });
          }
          return;
        }
        const element = previewElementRef.current;
        if (
          anchor &&
          element?.dataset.documentPath === path &&
          !findMarkdownFragmentTarget(element, anchor)
        ) {
          await reportError(`문서에서 “${anchor}” 앵커를 찾을 수 없습니다.`);
          return;
        }
        const entry = { path, anchor, scrollTop: null };
        pushEntry(entry);
        restoreEntry(entry, false);
        return;
      }

      const currentPath = documentPathRef.current;
      if (!currentPath) {
        await reportError("상대 문서 링크를 열려면 현재 Markdown을 먼저 파일로 저장해 주세요.");
        return;
      }
      if (isNavigatingRef.current) return;
      isNavigatingRef.current = true;
      try {
        const resolvedPath = await resolveRelativeMarkdownPath(currentPath, target.path);
        const anchor = target.anchor;
        if (resolvedPath === currentPath) {
          const element = previewElementRef.current;
          if (
            anchor &&
            element?.dataset.documentPath === currentPath &&
            !findMarkdownFragmentTarget(element, anchor)
          ) {
            await reportError(
              `문서에서 “${anchor}” 앵커를 찾을 수 없습니다.`,
            );
            return;
          }
          const entry = { path: currentPath, anchor, scrollTop: null };
          pushEntry(entry);
          restoreEntry(entry, false);
          return;
        }
        pendingPathRef.current = resolvedPath;
        const outcome = await openDocument(resolvedPath, "link");
        if (outcome === "opened" || outcome === "current") {
          observedPathRef.current = resolvedPath;
          const entry = { path: resolvedPath, anchor, scrollTop: null };
          pushEntry(entry);
          restoreEntry(entry, false);
        }
        pendingPathRef.current = null;
      } catch (error) {
        await reportError(error);
      } finally {
        pendingPathRef.current = null;
        isNavigatingRef.current = false;
      }
    },
    [openDocument, pushEntry, reportError, restoreEntry, setPreviewScrollTop],
  );

  const resolveRelativeImage = useCallback(async (src: string) => {
    const currentPath = previewDocumentPath;
    const relativePath = decodeRelativeAssetPath(src);
    if (!currentPath || !relativePath) {
      throw new Error("상대 이미지를 읽을 현재 Markdown 경로가 없습니다.");
    }
    return readRelativeImage(currentPath, relativePath);
  }, [previewDocumentPath]);

  return {
    canGoBack: controls.canGoBack,
    canGoForward: controls.canGoForward,
    goBack: () => navigateToEntry(historyRef.current.index - 1),
    goForward: () => navigateToEntry(historyRef.current.index + 1),
    activateLink,
    resolveRelativeImage,
  };
}
