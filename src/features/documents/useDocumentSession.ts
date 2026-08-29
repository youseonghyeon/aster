import { listen } from "@tauri-apps/api/event";
import { useCallback, useEffect, useReducer, useRef } from "react";
import type {
  AppEventChannel,
  DocumentOpenOutcome,
  DocumentOpenSource,
} from "../../shared/app-events";
import {
  getDocumentNoteStorageKey,
  hasUnsavedMarkdown,
  loadDocumentNote,
  saveDocumentNote,
} from "./document-session";
import {
  createDocumentSessionState,
  documentSessionReducer,
  type DocumentOperation,
  type DocumentOperationKind,
  type DocumentSessionAction,
  type DocumentSnapshot,
} from "./document-session-state";
import { initialMarkdown } from "./initial-document";
import {
  chooseMarkdownFilePath,
  confirmDocumentSwitchDiscard,
  confirmReloadDiscard,
  getMarkdownFileStatus,
  isDesktopRuntime,
  readMarkdownFile,
  showMarkdownMessage,
  type OpenedMarkdownFile,
} from "./markdown-files";
import { promoteRecentDocument, saveRecentDocuments } from "./recent-documents";
import {
  useExternalFileStatus,
  type ExternalFileState,
} from "./useExternalFileStatus";

type UseDocumentSessionOptions = {
  events: AppEventChannel;
};

export function useDocumentSession({ events }: UseDocumentSessionOptions) {
  const [state, reducerDispatch] = useReducer(
    documentSessionReducer,
    undefined,
    createDocumentSessionState,
  );
  const stateRef = useRef(state);
  const mountedRef = useRef(false);
  const nextOperationTokenRef = useRef(0);
  const activeOperationRef = useRef<DocumentOperation | null>(null);
  const noteSaveTimerRef = useRef<number | null>(null);
  const recentStatusBatchRef = useRef(0);
  const openFromPickerRef = useRef<
    (source: "picker" | "native") => Promise<DocumentOpenOutcome>
  >(async () => "cancelled");

  const dispatch = useCallback((action: DocumentSessionAction) => {
    if (!mountedRef.current) {
      return;
    }

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
      if (activeOperationRef.current !== null) {
        return null;
      }

      const operation = {
        token: nextOperationTokenRef.current + 1,
        kind,
      };
      nextOperationTokenRef.current = operation.token;
      activeOperationRef.current = operation;
      dispatch({ type: "operation-started", operation });
      return operation;
    },
    [dispatch],
  );

  const finishOperation = useCallback(
    (operation: DocumentOperation) => {
      if (activeOperationRef.current?.token !== operation.token) {
        return;
      }

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

  const showDocumentOpenError = useCallback(async (error: unknown) => {
    if (!mountedRef.current) {
      return;
    }

    const errorMessage = error instanceof Error ? error.message : String(error);

    try {
      await showMarkdownMessage(errorMessage, {
        title: "파일을 열 수 없습니다",
        kind: "error",
      });
    } catch {
      console.error("파일을 열 수 없습니다:", errorMessage);
    }
  }, []);

  const cancelPendingNoteSave = useCallback(() => {
    if (noteSaveTimerRef.current !== null) {
      window.clearTimeout(noteSaveTimerRef.current);
      noteSaveTimerRef.current = null;
    }
  }, []);

  const flushCurrentNote = useCallback(async (): Promise<boolean> => {
    if (!mountedRef.current) {
      return false;
    }
    cancelPendingNoteSave();
    const current = stateRef.current;
    const didSave = saveDocumentNote(
      getDocumentNoteStorageKey(current.document.path),
      current.note.value,
    );
    dispatch({
      type: "note-save-result",
      status: didSave ? "saved" : "error",
    });

    if (didSave) {
      return true;
    }

    if (!mountedRef.current) {
      return false;
    }

    try {
      await showMarkdownMessage(
        "현재 문서의 메모를 저장하지 못해 문서 전환을 중단했습니다. 저장 공간을 확인한 뒤 다시 시도해 주세요.",
        {
          title: "메모를 보존할 수 없습니다",
          kind: "error",
        },
      );
    } catch {
      console.error("메모를 저장하지 못해 문서 전환을 중단했습니다.");
    }
    return false;
  }, [cancelPendingNoteSave, dispatch]);

  const markRecentPathAvailability = useCallback(
    async (path: string) => {
      if (!isDesktopRuntime()) {
        return;
      }

      try {
        const status = await getMarkdownFileStatus(path);
        if (!mountedRef.current) {
          return;
        }
        const paths = new Set(stateRef.current.recent.unavailablePaths);
        if (status.kind === "unavailable") {
          paths.add(path);
        } else {
          paths.delete(path);
        }
        dispatch({ type: "set-unavailable-paths", paths });
      } catch {
        // Transport failures do not prove that the document is unavailable.
      }
    },
    [dispatch],
  );

  const switchToDocument = useCallback(
    async (
      requestedPath: string,
      markUnavailableOnFailure: boolean,
    ): Promise<DocumentOpenOutcome> => {
      let openedFile: OpenedMarkdownFile;

      try {
        openedFile = await readMarkdownFile(requestedPath);
      } catch (error) {
        if (!mountedRef.current) {
          return "cancelled";
        }
        if (markUnavailableOnFailure) {
          await markRecentPathAvailability(requestedPath);
        }
        await showDocumentOpenError(error);
        return "failed";
      }

      if (!mountedRef.current) {
        return "cancelled";
      }

      const beforeConfirmation = stateRef.current.document;
      const hasUnsavedChanges = hasUnsavedMarkdown(
        beforeConfirmation.markdown,
        beforeConfirmation.loadedMarkdown,
        initialMarkdown,
      );

      if (hasUnsavedChanges) {
        let shouldSwitch: boolean;
        try {
          shouldSwitch = await confirmDocumentSwitchDiscard();
        } catch (error) {
          await showDocumentOpenError(error);
          return "failed";
        }

        if (!mountedRef.current) {
          return "cancelled";
        }

        if (!shouldSwitch) {
          return "cancelled";
        }
      }

      const latestDocument = stateRef.current.document;
      if (
        latestDocument.generation !== beforeConfirmation.generation ||
        latestDocument.path !== beforeConfirmation.path ||
        latestDocument.editVersion !== beforeConfirmation.editVersion
      ) {
        return "cancelled";
      }

      if (!(await flushCurrentNote()) || !mountedRef.current) {
        return mountedRef.current ? "failed" : "cancelled";
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
      const previousPath = current.document.path;
      const nextDocument: DocumentSnapshot = {
        name: openedFile.name,
        path: openedFile.path,
        markdown: openedFile.content,
        loadedMarkdown: openedFile.content,
        revision: openedFile.revision,
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
      resetExternalFileStatus();
      if (mountedRef.current) {
        events.emit("document-committed", {
          kind: "open",
          previousPath,
          path: openedFile.path,
        });
      }
      return "opened";
    },
    [
      dispatch,
      events,
      flushCurrentNote,
      markRecentPathAvailability,
      resetExternalFileStatus,
      showDocumentOpenError,
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
        const selectedPath = await chooseMarkdownFilePath();
        outcome = !mountedRef.current
          ? "cancelled"
          : selectedPath
          ? await switchToDocument(selectedPath, false)
          : "cancelled";
      } catch (error) {
        await showDocumentOpenError(error);
        outcome = "failed";
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
      showDocumentOpenError,
      switchToDocument,
    ],
  );
  openFromPickerRef.current = openFromPicker;

  const openDocument = useCallback(
    async (
      path: string,
      source: "recent" = "recent",
    ): Promise<DocumentOpenOutcome> => {
      if (path === stateRef.current.document.path) {
        emitOpenSettled(source, "current");
        return "current";
      }

      const operation = beginOperation("open");
      if (!operation) {
        emitOpenSettled(source, "busy");
        return "busy";
      }

      let outcome: DocumentOpenOutcome = "failed";
      try {
        outcome = await switchToDocument(path, true);
      } catch (error) {
        await showDocumentOpenError(error);
        outcome = "failed";
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
      showDocumentOpenError,
      switchToDocument,
    ],
  );

  const reloadDocument = useCallback(async (): Promise<DocumentOpenOutcome> => {
    const initial = stateRef.current.document;
    if (!initial.path) {
      return "cancelled";
    }

    const operation = beginOperation("reload");
    if (!operation) {
      return "busy";
    }

    try {
      if (
        initial.loadedMarkdown !== null &&
        initial.markdown !== initial.loadedMarkdown
      ) {
        const shouldReload = await confirmReloadDiscard();
        if (!mountedRef.current) {
          return "cancelled";
        }
        if (!shouldReload) {
          return "cancelled";
        }
      }

      const afterConfirmation = stateRef.current.document;
      if (
        afterConfirmation.generation !== initial.generation ||
        afterConfirmation.path !== initial.path
      ) {
        return "cancelled";
      }
      const approvedEditVersion = afterConfirmation.editVersion;
      const reloadedFile = await readMarkdownFile(initial.path);

      if (!mountedRef.current) {
        return "cancelled";
      }
      const afterRead = stateRef.current.document;
      if (
        afterRead.generation !== initial.generation ||
        afterRead.path !== initial.path
      ) {
        return "cancelled";
      }
      if (afterRead.editVersion !== approvedEditVersion) {
        try {
          await showMarkdownMessage(
            "다시 불러오는 동안 Markdown이 수정되어 현재 내용을 유지했습니다. 최신 원본을 적용하려면 다시 시도해 주세요.",
            { title: "현재 변경 내용 유지", kind: "info" },
          );
        } catch {
          console.info("다시 불러오는 동안 수정된 Markdown을 유지했습니다.");
        }
        return "cancelled";
      }

      dispatch({
        type: "commit-reload",
        name: reloadedFile.name,
        markdown: reloadedFile.content,
        revision: reloadedFile.revision,
      });
      resetExternalFileStatus();
      if (mountedRef.current) {
        events.emit("document-committed", {
          kind: "reload",
          previousPath: initial.path,
          path: initial.path,
        });
      }
      return "opened";
    } catch (error) {
      const current = stateRef.current.document;
      if (
        mountedRef.current &&
        current.generation === initial.generation &&
        current.path === initial.path
      ) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        const nextState: ExternalFileState = {
          kind: "unavailable",
          message: errorMessage,
          observationKey: `unavailable:${errorMessage}`,
        };
        setExternalFileState(nextState);
        setDismissedExternalObservationKey(null);
      }
      return "failed";
    } finally {
      finishOperation(operation);
    }
  }, [
    beginOperation,
    dispatch,
    events,
    finishOperation,
    resetExternalFileStatus,
    setDismissedExternalObservationKey,
    setExternalFileState,
  ]);

  const editMarkdown = useCallback(
    (value: string) => dispatch({ type: "edit-markdown", value }),
    [dispatch],
  );
  const editNote = useCallback(
    (value: string) => dispatch({ type: "edit-note", value }),
    [dispatch],
  );
  const dismissExternalFileNotice = useCallback(() => {
    if (!externalFileState) {
      return;
    }
    setDismissedExternalObservationKey(externalFileState.observationKey);
    events.emit("external-notice-dismissed", undefined);
  }, [events, externalFileState, setDismissedExternalObservationKey]);

  useEffect(() => {
    cancelPendingNoteSave();
    const { document, note } = state;
    noteSaveTimerRef.current = window.setTimeout(() => {
      noteSaveTimerRef.current = null;
      if (!mountedRef.current) {
        return;
      }
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
        status: saveDocumentNote(
          getDocumentNoteStorageKey(document.path),
          note.value,
        )
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

  useEffect(() => {
    let disposed = false;
    let stopListening: (() => void) | undefined;
    void listen("open-markdown-requested", () => {
      void openFromPickerRef.current("native");
    }).then((unlisten) => {
      if (disposed) {
        unlisten();
      } else {
        stopListening = unlisten;
      }
    }).catch((error) => {
      if (!disposed) {
        console.error("Markdown 파일 열기 이벤트를 연결하지 못했습니다.", error);
      }
    });
    return () => {
      disposed = true;
      stopListening?.();
    };
  }, []);

  useEffect(
    () =>
      events.subscribe("recent-sidebar-opened", () => {
        if (!isDesktopRuntime()) {
          return;
        }
        const batch = recentStatusBatchRef.current + 1;
        recentStatusBatchRef.current = batch;
        const documents = stateRef.current.recent.documents;
        void Promise.all(
          documents.map(async (document) => {
            try {
              return {
                path: document.path,
                status: await getMarkdownFileStatus(document.path),
              };
            } catch {
              return null;
            }
          }),
        ).then((results) => {
          if (!mountedRef.current || batch !== recentStatusBatchRef.current) {
            return;
          }
          const recentPaths = new Set(documents.map((document) => document.path));
          const unavailablePaths = new Set(
            Array.from(stateRef.current.recent.unavailablePaths).filter((path) =>
              recentPaths.has(path),
            ),
          );
          for (const result of results) {
            if (!result) continue;
            if (result.status.kind === "unavailable") {
              unavailablePaths.add(result.path);
            } else {
              unavailablePaths.delete(result.path);
            }
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
    },
    note: state.note,
    recent: state.recent,
    externalFileState,
    visibleExternalFileState,
    isOpening: state.operation?.kind === "open",
    isReloading: state.operation?.kind === "reload",
    isBusy: state.operation !== null,
    editMarkdown,
    editNote,
    openFromPicker,
    openDocument,
    reloadDocument,
    dismissExternalFileNotice,
  };
}
