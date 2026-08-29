import { useCallback, type RefObject } from "react";
import type {
  AppEventChannel,
  DocumentOpenOutcome,
  DocumentOpenSource,
} from "../../shared/app-events";
import {
  getDocumentDraftIdentity,
  getDocumentNoteStorageKey,
  loadDocumentNote,
} from "./document-session";
import {
  type DocumentOperation,
  type DocumentOperationKind,
  type DocumentSessionAction,
  type DocumentSessionState,
  type DocumentSnapshot,
} from "./document-session-state";
import { isDocumentDirty, isSameDocumentContext } from "./document-transactions";
import { initialMarkdown } from "./initial-document";
import {
  chooseLeaveDocumentDecision,
  chooseMarkdownFilePath,
  chooseRecoveryDecision,
  confirmReloadDiscard,
  getMarkdownFileStatus,
  isDesktopRuntime,
  readMarkdownFile,
  showMarkdownMessage,
  type OpenedMarkdownFile,
} from "./markdown-files";
import {
  promoteRecentDocument,
  saveRecentDocuments,
  type RecentDocument,
} from "./recent-documents";
import type { ExternalFileState } from "./useExternalFileStatus";

type LeaveResult = {
  allowed: boolean;
  didDecide?: boolean;
  discardedIdentity?: string;
};

type UseDocumentNavigationOptions = {
  events: AppEventChannel;
  stateRef: RefObject<DocumentSessionState>;
  mountedRef: RefObject<boolean>;
  dispatch: (action: DocumentSessionAction) => void;
  beginOperation: (kind: DocumentOperationKind) => DocumentOperation | null;
  finishOperation: (operation: DocumentOperation) => void;
  emitOpenSettled: (
    source: DocumentOpenSource,
    outcome: DocumentOpenOutcome,
  ) => void;
  flushCurrentNote: () => Promise<boolean>;
  performSave: () => Promise<boolean>;
  discardDraft: (identity?: string) => Promise<unknown>;
  loadDraft: (identity: string) => Promise<{
    content: string;
    baseRevision: string | null;
  } | null>;
  resetExternalFileStatus: () => void;
  setExternalFileState: (state: ExternalFileState) => void;
  setDismissedExternalObservationKey: (key: string | null) => void;
  showError: (error: unknown, title?: string) => Promise<void>;
};

export function useDocumentNavigation({
  events,
  stateRef,
  mountedRef,
  dispatch,
  beginOperation,
  finishOperation,
  emitOpenSettled,
  flushCurrentNote,
  performSave,
  discardDraft,
  loadDraft,
  resetExternalFileStatus,
  setExternalFileState,
  setDismissedExternalObservationKey,
  showError,
}: UseDocumentNavigationOptions) {
  const ensureCanLeave = useCallback(
    async (reason: "switch" | "quit"): Promise<LeaveResult> => {
      const current = stateRef.current.document;
      if (!isDocumentDirty(current)) return { allowed: true, didDecide: false };
      const decision = await chooseLeaveDocumentDecision(current.name, reason);
      if (!mountedRef.current || decision === "cancel") {
        return { allowed: false, didDecide: true };
      }
      if (!isSameDocumentContext(stateRef.current.document, current, true)) {
        return { allowed: false, didDecide: true };
      }
      if (decision === "save") {
        const didSave = await performSave();
        return {
          allowed: didSave && !isDocumentDirty(stateRef.current.document),
          didDecide: true,
        };
      }
      return {
        allowed: true,
        didDecide: true,
        discardedIdentity: current.draftIdentity,
      };
    },
    [mountedRef, performSave, stateRef],
  );

  const markRecentPathAvailability = useCallback(
    async (path: string) => {
      if (!isDesktopRuntime()) return;
      try {
        const status = await getMarkdownFileStatus(path);
        if (!mountedRef.current) return;
        const paths = new Set(stateRef.current.recent.unavailablePaths);
        if (status.kind === "unavailable") paths.add(path);
        else paths.delete(path);
        dispatch({ type: "set-unavailable-paths", paths });
      } catch {
        // Transport failures do not prove that the document is unavailable.
      }
    },
    [dispatch, mountedRef, stateRef],
  );

  const restoreUnavailableDraft = useCallback(
    async (requestedPath: string): Promise<DocumentOpenOutcome | null> => {
      const targetIdentity = getDocumentDraftIdentity(requestedPath);
      const draft = await loadDraft(targetIdentity);
      if (!draft || !mountedRef.current) return null;
      const name = requestedPath.split(/[\\/]/).pop() ?? "복구된 문서.md";
      if ((await chooseRecoveryDecision(name, true)) !== "restore") {
        await discardDraft(targetIdentity).catch(console.error);
        return null;
      }
      const leave = await ensureCanLeave("switch");
      if (!leave.allowed || !mountedRef.current || !(await flushCurrentNote())) {
        return "cancelled";
      }
      const current = stateRef.current;
      const unavailablePaths = new Set(current.recent.unavailablePaths);
      unavailablePaths.add(requestedPath);
      dispatch({
        type: "commit-open",
        document: {
          name,
          path: null,
          markdown: initialMarkdown,
          loadedMarkdown: null,
          revision: null,
          format: { hasBom: false, lineEnding: "lf" },
          draftIdentity: targetIdentity,
          saveStatus: "saved",
          recovered: false,
          generation: current.document.generation + 1,
          editVersion: current.document.editVersion + 1,
        },
        note: loadDocumentNote(getDocumentNoteStorageKey(requestedPath)),
        recentDocuments: current.recent.documents,
        unavailablePaths,
        persistenceLimited: current.recent.persistenceLimited,
      });
      dispatch({ type: "restore-draft", markdown: draft.content, conflicted: true });
      resetExternalFileStatus();
      events.emit("document-committed", {
        kind: "open",
        previousPath: current.document.path,
        path: requestedPath,
      });
      if (leave.discardedIdentity) {
        await discardDraft(leave.discardedIdentity).catch(console.error);
      }
      return "opened";
    },
    [
      discardDraft,
      dispatch,
      ensureCanLeave,
      events,
      flushCurrentNote,
      loadDraft,
      mountedRef,
      resetExternalFileStatus,
      stateRef,
    ],
  );

  const switchToDocument = useCallback(
    async (
      requestedPath: string,
      markUnavailableOnFailure: boolean,
    ): Promise<DocumentOpenOutcome> => {
      let preflight: OpenedMarkdownFile;
      try {
        preflight = await readMarkdownFile(requestedPath);
      } catch (error) {
        if (markUnavailableOnFailure) await markRecentPathAvailability(requestedPath);
        try {
          const recovered = await restoreUnavailableDraft(requestedPath);
          if (recovered) return recovered;
        } catch (recoveryError) {
          console.error("읽을 수 없는 문서의 복구 초안을 확인하지 못했습니다:", recoveryError);
        }
        await showError(error, "파일을 열 수 없습니다");
        return mountedRef.current ? "failed" : "cancelled";
      }
      if (!mountedRef.current) return "cancelled";

      const leave = await ensureCanLeave("switch");
      if (!leave.allowed || !mountedRef.current) return "cancelled";
      const approvedDocument = stateRef.current.document;
      let openedFile = preflight;
      if (leave.didDecide) {
        try {
          openedFile = await readMarkdownFile(requestedPath);
        } catch (error) {
          await showError(error, "파일을 열 수 없습니다");
          return "failed";
        }
      }
      if (!mountedRef.current || !(await flushCurrentNote())) return "failed";

      const targetIdentity = getDocumentDraftIdentity(openedFile.path);
      let recoveredContent: string | null = null;
      let recoveredConflict = false;
      let discardTargetDraft = false;
      try {
        const draft = await loadDraft(targetIdentity);
        if (draft && draft.content !== openedFile.content) {
          const diskChanged = draft.baseRevision !== openedFile.revision;
          if ((await chooseRecoveryDecision(openedFile.name, diskChanged)) === "restore") {
            recoveredContent = draft.content;
            recoveredConflict = diskChanged;
          } else {
            discardTargetDraft = true;
          }
        } else if (draft) {
          discardTargetDraft = true;
        }
      } catch (error) {
        console.error("복구 초안을 확인하지 못했습니다:", error);
      }
      if (!mountedRef.current) return "cancelled";
      if (
        !isSameDocumentContext(
          stateRef.current.document,
          approvedDocument,
          true,
        )
      ) {
        return "cancelled";
      }

      const current = stateRef.current;
      const recentDocuments = promoteRecentDocument(
        current.recent.documents,
        { path: openedFile.path, name: openedFile.name },
        [requestedPath],
      );
      const unavailablePaths = new Set(current.recent.unavailablePaths);
      unavailablePaths.delete(requestedPath);
      unavailablePaths.delete(openedFile.path);
      const nextDocument: DocumentSnapshot = {
        name: openedFile.name,
        path: openedFile.path,
        markdown: openedFile.content,
        loadedMarkdown: openedFile.content,
        revision: openedFile.revision,
        format: openedFile.format,
        draftIdentity: targetIdentity,
        saveStatus: "saved",
        recovered: false,
        generation: current.document.generation + 1,
        editVersion: current.document.editVersion + 1,
      };
      dispatch({
        type: "commit-open",
        document: nextDocument,
        note: loadDocumentNote(getDocumentNoteStorageKey(openedFile.path)),
        recentDocuments,
        unavailablePaths,
        persistenceLimited: !saveRecentDocuments(recentDocuments),
      });
      if (recoveredContent !== null) {
        dispatch({
          type: "restore-draft",
          markdown: recoveredContent,
          conflicted: recoveredConflict,
        });
      }
      resetExternalFileStatus();
      events.emit("document-committed", {
        kind: "open",
        previousPath: current.document.path,
        path: openedFile.path,
      });
      if (leave.discardedIdentity) {
        await discardDraft(leave.discardedIdentity).catch(console.error);
      }
      if (discardTargetDraft) {
        await discardDraft(targetIdentity).catch(console.error);
      }
      return "opened";
    },
    [
      discardDraft,
      dispatch,
      ensureCanLeave,
      events,
      flushCurrentNote,
      loadDraft,
      markRecentPathAvailability,
      mountedRef,
      resetExternalFileStatus,
      restoreUnavailableDraft,
      showError,
      stateRef,
    ],
  );

  const openFromPicker = useCallback(
    async (source: "picker" | "native"): Promise<DocumentOpenOutcome> => {
      const operation = beginOperation("open");
      if (!operation) {
        emitOpenSettled(source, "busy");
        return "busy";
      }
      let outcome: DocumentOpenOutcome = "failed";
      try {
        const path = await chooseMarkdownFilePath();
        outcome = !mountedRef.current
          ? "cancelled"
          : path
            ? await switchToDocument(path, false)
            : "cancelled";
      } catch (error) {
        await showError(error, "파일을 열 수 없습니다");
      } finally {
        finishOperation(operation);
        emitOpenSettled(source, outcome);
      }
      return outcome;
    },
    [
      beginOperation,
      emitOpenSettled,
      finishOperation,
      mountedRef,
      showError,
      switchToDocument,
    ],
  );

  const openDocument = useCallback(
    async (
      path: string,
      source: Extract<DocumentOpenSource, "folder" | "recent"> = "recent",
    ) => {
      if (path === stateRef.current.document.path) {
        emitOpenSettled(source, "current");
        return "current" as const;
      }
      const operation = beginOperation("open");
      if (!operation) {
        emitOpenSettled(source, "busy");
        return "busy" as const;
      }
      let outcome: DocumentOpenOutcome = "failed";
      try {
        outcome = await switchToDocument(path, true);
      } finally {
        finishOperation(operation);
        emitOpenSettled(source, outcome);
      }
      return outcome;
    },
    [beginOperation, emitOpenSettled, finishOperation, stateRef, switchToDocument],
  );

  const openRecentDocument = useCallback(
    (document: RecentDocument) => openDocument(document.path, "recent"),
    [openDocument],
  );

  const reloadDocument = useCallback(async (): Promise<DocumentOpenOutcome> => {
    const original = stateRef.current.document;
    if (!original.path) return "cancelled";
    const operation = beginOperation("reload");
    if (!operation) return "busy";
    try {
      if (isDocumentDirty(original) && !(await confirmReloadDiscard())) {
        return "cancelled";
      }
      if (!mountedRef.current) return "cancelled";
      const approved = stateRef.current.document;
      const file = await readMarkdownFile(original.path);
      if (!mountedRef.current) return "cancelled";
      if (!isSameDocumentContext(stateRef.current.document, approved, true)) {
        await showMarkdownMessage(
          "다시 불러오는 동안 Markdown이 수정되어 현재 내용을 유지했습니다. 최신 원본을 적용하려면 다시 시도해 주세요.",
          { title: "현재 변경 내용 유지", kind: "info" },
        ).catch(() => undefined);
        return "cancelled";
      }
      dispatch({
        type: "commit-reload",
        name: file.name,
        markdown: file.content,
        revision: file.revision,
        format: file.format,
        external: false,
      });
      resetExternalFileStatus();
      await discardDraft(original.draftIdentity).catch(console.error);
      events.emit("document-committed", {
        kind: "reload",
        previousPath: original.path,
        path: original.path,
      });
      return "opened";
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setExternalFileState({
        kind: "unavailable",
        message,
        observationKey: `unavailable:${message}`,
      });
      setDismissedExternalObservationKey(null);
      return "failed";
    } finally {
      finishOperation(operation);
    }
  }, [
    beginOperation,
    discardDraft,
    dispatch,
    events,
    finishOperation,
    mountedRef,
    resetExternalFileStatus,
    setDismissedExternalObservationKey,
    setExternalFileState,
    stateRef,
  ]);

  return {
    ensureCanLeave,
    openFromPicker,
    openDocument,
    openRecentDocument,
    reloadDocument,
  };
}
