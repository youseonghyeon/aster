import { useCallback, useEffect, useReducer, useRef } from "react";
import type {
  AppEventChannel,
  DocumentOpenOutcome,
  DocumentOpenSource,
} from "../../shared/app-events";
import {
  getDocumentNoteStorageKey,
  saveDocumentNote,
} from "./document-session";
import {
  createDocumentSessionState,
  documentSessionReducer,
  type DocumentOperation,
  type DocumentOperationKind,
  type DocumentSessionAction,
} from "./document-session-state";
import {
  isDocumentDirty,
  isSameDocumentContext,
} from "./document-transactions";
import { initialMarkdown } from "./initial-document";
import {
  chooseExternalConflictDecision,
  chooseLeaveDocumentDecision,
  chooseRecoveryDecision,
  getMarkdownFileStatus,
  isDesktopRuntime,
  readMarkdownFile,
  showMarkdownMessage,
  type OpenedMarkdownFile,
} from "./markdown-files";
import { useDocumentCloseGuard } from "./useDocumentCloseGuard";
import { useLastOpenedDocument } from "./useLastOpenedDocument";
import { useDocumentNavigation } from "./useDocumentNavigation";
import { useDocumentPersistence } from "./useDocumentPersistence";
import { useDocumentRecovery } from "./useDocumentRecovery";
import { useExternalFileStatus } from "./useExternalFileStatus";
import { useDocumentNativeCommands } from "./useDocumentNativeCommands";

type UseDocumentSessionOptions = {
  events: AppEventChannel;
  isBlockingModalOpen?: () => boolean;
};

const isNoBlockingModalOpen = () => false;

export function useDocumentSession({
  events,
  isBlockingModalOpen = isNoBlockingModalOpen,
}: UseDocumentSessionOptions) {
  const [state, reducerDispatch] = useReducer(
    documentSessionReducer,
    undefined,
    createDocumentSessionState,
  );
  const stateRef = useRef(state);
  const mountedRef = useRef(false);
  const nextOperationTokenRef = useRef(0);
  const nextExternalCommitTokenRef = useRef(0);
  const activeOperationRef = useRef<DocumentOperation | null>(null);
  const noteSaveTimerRef = useRef<number | null>(null);
  const recentStatusBatchRef = useRef(0);
  const handledExternalObservationRef = useRef<string | null>(null);
  const initialRecoveryCheckedRef = useRef(false);
  const saveDocumentRef = useRef<() => Promise<boolean>>(async () => false);
  const scopedDocumentReaderRef = useRef<
    (() => Promise<OpenedMarkdownFile>) | null
  >(null);
  const openFromPickerRef = useRef<
    (source: "picker" | "native") => Promise<DocumentOpenOutcome>
  >(async () => "cancelled");

  const dispatch = useCallback((action: DocumentSessionAction) => {
    if (!mountedRef.current) return;
    stateRef.current = documentSessionReducer(stateRef.current, action);
    reducerDispatch(action);
  }, []);

  const {
    externalFileState,
    visibleExternalFileState,
    setExternalFileState,
    setDismissedExternalObservationKey,
    resetExternalFileStatus,
  } = useExternalFileStatus({
    documentPath: state.document.path,
    loadedRevision: state.document.revision,
    onBeforeNotice: () => events.emit("external-notice-will-show", undefined),
  });

  const { flushDraft, discardDraft, reserveDiscardFence, loadDraft } =
    useDocumentRecovery(
      {
        identity: state.document.draftIdentity,
        path: state.document.path,
        markdown: state.document.markdown,
        loadedMarkdown: state.document.loadedMarkdown ?? initialMarkdown,
        revision: state.document.revision,
        generation: state.document.generation,
      },
      (message) => console.error("복구 초안을 저장하지 못했습니다:", message),
    );

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      activeOperationRef.current = null;
      if (noteSaveTimerRef.current !== null) {
        window.clearTimeout(noteSaveTimerRef.current);
        noteSaveTimerRef.current = null;
      }
    };
  }, []);

  const beginOperation = useCallback(
    (kind: DocumentOperationKind): DocumentOperation | null => {
      if (activeOperationRef.current !== null) return null;
      const operation = { token: ++nextOperationTokenRef.current, kind };
      activeOperationRef.current = operation;
      dispatch({ type: "operation-started", operation });
      return operation;
    },
    [dispatch],
  );

  const finishOperation = useCallback(
    (operation: DocumentOperation) => {
      if (activeOperationRef.current?.token !== operation.token) return;
      activeOperationRef.current = null;
      dispatch({ type: "operation-finished", token: operation.token });
    },
    [dispatch],
  );

  const emitOpenSettled = useCallback(
    (source: DocumentOpenSource, outcome: DocumentOpenOutcome) => {
      if (mountedRef.current) {
        events.emit("document-open-settled", { source, outcome });
      }
    },
    [events],
  );

  const showError = useCallback(
    async (error: unknown, title = "파일을 처리할 수 없습니다") => {
      if (!mountedRef.current) return;
      const message = error instanceof Error ? error.message : String(error);
      try {
        await showMarkdownMessage(message, { title, kind: "error" });
      } catch {
        console.error(`${title}:`, message);
      }
    },
    [],
  );

  const cancelPendingNoteSave = useCallback(() => {
    if (noteSaveTimerRef.current !== null) {
      window.clearTimeout(noteSaveTimerRef.current);
      noteSaveTimerRef.current = null;
    }
  }, []);

  const flushCurrentNote = useCallback(async (): Promise<boolean> => {
    if (!mountedRef.current) return false;
    cancelPendingNoteSave();
    const current = stateRef.current;
    const didSave = saveDocumentNote(
      getDocumentNoteStorageKey(current.document.path),
      current.note.value,
    );
    dispatch({ type: "note-save-result", status: didSave ? "saved" : "error" });
    if (didSave) return true;
    await showError(
      "현재 문서의 메모를 저장하지 못했습니다. 저장 공간을 확인한 뒤 다시 시도해 주세요.",
      "메모를 보존할 수 없습니다",
    );
    return false;
  }, [cancelPendingNoteSave, dispatch, showError]);

  const { applyExternalFile, performSave, saveDocument } =
    useDocumentPersistence({
      events,
      stateRef,
      scopedDocumentReaderRef,
      mountedRef,
      nextExternalCommitTokenRef,
      handledExternalObservationRef,
      dispatch,
      beginOperation,
      finishOperation,
      resetExternalFileStatus,
      discardDraft,
      flushDraft,
      showError,
    });
  saveDocumentRef.current = saveDocument;

  const {
    ensureCanLeave,
    openFromPicker,
    openDocument,
    openRecentDocument,
    reloadDocument,
  } = useDocumentNavigation({
    events,
    stateRef,
    scopedDocumentReaderRef,
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
  });
  openFromPickerRef.current = openFromPicker;

  useEffect(() => {
    if (
      externalFileState?.kind !== "modified" ||
      handledExternalObservationRef.current === externalFileState.observationKey ||
      activeOperationRef.current !== null
    ) {
      return;
    }
    handledExternalObservationRef.current = externalFileState.observationKey;
    const operation = beginOperation("external");
    if (!operation) return;
    void (async () => {
      try {
        const snapshot = stateRef.current.document;
        if (!snapshot.path) return;
        const external = await (scopedDocumentReaderRef.current?.() ??
          readMarkdownFile(snapshot.path));
        if (!mountedRef.current || stateRef.current.document.path !== snapshot.path) return;
        if (!isDocumentDirty(stateRef.current.document)) {
          await applyExternalFile(external);
          return;
        }
        dispatch({ type: "external-conflict" });
        const decision = await chooseExternalConflictDecision(snapshot.name);
        if (!mountedRef.current) return;
        if (decision === "external") {
          await applyExternalFile(external);
        } else if (decision === "overwrite") {
          await performSave({
            targetPath: scopedDocumentReaderRef.current
              ? snapshot.path
              : external.path,
            expectedRevision: external.revision,
          });
        }
      } catch (error) {
        await showError(error);
      } finally {
        finishOperation(operation);
      }
    })();
  }, [
    applyExternalFile,
    beginOperation,
    dispatch,
    externalFileState,
    finishOperation,
    performSave,
    scopedDocumentReaderRef,
    showError,
    state.operation,
  ]);

  const decideClose = useCallback(async () => {
    if (activeOperationRef.current !== null) return { allow: false };
    if (!(await flushCurrentNote())) return { allow: false };
    const current = stateRef.current.document;
    if (!isDocumentDirty(current)) return { allow: true };
    const decision = await chooseLeaveDocumentDecision(current.name, "quit");
    if (!mountedRef.current || decision === "cancel") return { allow: false };
    if (decision === "save") return { allow: await saveDocumentRef.current() };
    return {
      allow: true,
      discardDraft: reserveDiscardFence(current.draftIdentity),
    };
  }, [flushCurrentNote, reserveDiscardFence]);
  useDocumentCloseGuard(decideClose);
  const { hasStoredDocument, isRestoring } = useLastOpenedDocument({
    documentPath: state.document.path,
    fallbackDocumentPath: state.recent.documents[0]?.path ?? null,
    openDocument,
  });

  useEffect(() => {
    if (initialRecoveryCheckedRef.current || !isDesktopRuntime()) return;
    initialRecoveryCheckedRef.current = true;
    if (hasStoredDocument) return;
    const initial = stateRef.current.document;
    void loadDraft(initial.draftIdentity)
      .then(async (draft) => {
        if (!mountedRef.current || !draft || draft.content === initialMarkdown) return;
        if (!isSameDocumentContext(stateRef.current.document, initial, true)) return;
        const decision = await chooseRecoveryDecision(initial.name, false);
        if (!mountedRef.current) return;
        if (!isSameDocumentContext(stateRef.current.document, initial, true)) return;
        if (decision === "restore") {
          dispatch({ type: "restore-draft", markdown: draft.content, conflicted: false });
        } else {
          await discardDraft(initial.draftIdentity);
        }
      })
      .catch((error) => console.error("새 문서 복구 초안을 확인하지 못했습니다:", error));
  }, [discardDraft, dispatch, hasStoredDocument, loadDraft]);

  const editMarkdown = useCallback(
    (value: string) => dispatch({ type: "edit-markdown", value }),
    [dispatch],
  );
  const editNote = useCallback(
    (value: string) => dispatch({ type: "edit-note", value }),
    [dispatch],
  );
  const dismissExternalFileNotice = useCallback(() => {
    if (!externalFileState) return;
    setDismissedExternalObservationKey(externalFileState.observationKey);
    events.emit("external-notice-dismissed", undefined);
  }, [events, externalFileState, setDismissedExternalObservationKey]);

  useEffect(() => {
    cancelPendingNoteSave();
    const { document, note } = state;
    noteSaveTimerRef.current = window.setTimeout(() => {
      noteSaveTimerRef.current = null;
      if (!mountedRef.current) return;
      const current = stateRef.current;
      if (
        current.document.generation !== document.generation ||
        current.document.path !== document.path ||
        current.note.value !== note.value
      ) {
        return;
      }
      dispatch({
        type: "note-save-result",
        status: saveDocumentNote(getDocumentNoteStorageKey(document.path), note.value)
          ? "saved"
          : "error",
      });
    }, 350);
    return cancelPendingNoteSave;
  }, [
    cancelPendingNoteSave,
    dispatch,
    state.document.generation,
    state.document.path,
    state.note.value,
  ]);

  useDocumentNativeCommands({
    isBlockingModalOpen,
    openFromPickerRef,
    saveDocumentRef,
  });

  useEffect(
    () =>
      events.subscribe("recent-sidebar-opened", () => {
        if (!isDesktopRuntime()) return;
        const batch = ++recentStatusBatchRef.current;
        const documents = stateRef.current.recent.documents;
        void Promise.all(
          documents.map(async (document) => {
            try {
              return { path: document.path, status: await getMarkdownFileStatus(document.path) };
            } catch {
              return null;
            }
          }),
        ).then((results) => {
          if (!mountedRef.current || batch !== recentStatusBatchRef.current) return;
          const recentPaths = new Set(documents.map((document) => document.path));
          const unavailablePaths = new Set(
            Array.from(stateRef.current.recent.unavailablePaths).filter((path) =>
              recentPaths.has(path),
            ),
          );
          for (const result of results) {
            if (!result) continue;
            if (result.status.kind === "unavailable") unavailablePaths.add(result.path);
            else unavailablePaths.delete(result.path);
          }
          dispatch({ type: "set-unavailable-paths", paths: unavailablePaths });
        });
      }),
    [dispatch, events],
  );

  return {
    document: {
      name: state.document.name,
      path: state.document.path,
      markdown: state.document.markdown,
      saveStatus: state.document.saveStatus,
      recovered: state.document.recovered,
    },
    note: state.note,
    recent: state.recent,
    externalFileState,
    visibleExternalFileState,
    isOpening: state.operation?.kind === "open",
    isReloading:
      state.operation?.kind === "reload" || state.operation?.kind === "external",
    isSaving: state.operation?.kind === "save" || state.document.saveStatus === "saving",
    isBusy: state.operation !== null,
    isRestoringStartupDocument: isRestoring,
    editMarkdown,
    editNote,
    saveDocument,
    openFromPicker,
    openDocument,
    openRecentDocument,
    reloadDocument,
    dismissExternalFileNotice,
    ensureCanLeave,
  };
}
