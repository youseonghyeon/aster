import { useCallback, useRef, type RefObject } from "react";
import type { AppEventChannel } from "../../shared/app-events";
import {
  getDocumentDraftIdentity,
  getDocumentNoteStorageKey,
  loadDocumentNote,
} from "./document-session";
import {
  type DocumentOperation,
  type DocumentSessionAction,
  type DocumentSessionState,
} from "./document-session-state";
import { isDocumentDirty, isSameDocumentContext } from "./document-transactions";
import {
  chooseExternalConflictDecision,
  chooseMarkdownSavePath,
  readMarkdownFile,
  saveMarkdownFile,
  type OpenedMarkdownFile,
} from "./markdown-files";
import { promoteRecentDocument, saveRecentDocuments } from "./recent-documents";
import type { RecoveryDocumentSnapshot } from "./useDocumentRecovery";

type SaveOptions = {
  targetPath?: string;
  expectedRevision?: string | null;
  conflictAttempt?: number;
};

type UseDocumentPersistenceOptions = {
  events: AppEventChannel;
  stateRef: RefObject<DocumentSessionState>;
  scopedDocumentReaderRef: RefObject<
    (() => Promise<OpenedMarkdownFile>) | null
  >;
  mountedRef: RefObject<boolean>;
  nextExternalCommitTokenRef: RefObject<number>;
  handledExternalObservationRef: RefObject<string | null>;
  dispatch: (action: DocumentSessionAction) => void;
  beginOperation: (kind: "save") => DocumentOperation | null;
  finishOperation: (operation: DocumentOperation) => void;
  resetExternalFileStatus: () => void;
  discardDraft: (identity?: string) => Promise<unknown>;
  flushDraft: (snapshot?: RecoveryDocumentSnapshot) => Promise<void>;
  showError: (error: unknown, title?: string) => Promise<void>;
};

export function useDocumentPersistence({
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
}: UseDocumentPersistenceOptions) {
  const applyExternalFile = useCallback(
    async (file: OpenedMarkdownFile) => {
      const current = stateRef.current.document;
      if (current.path !== file.path) {
        if (current.path !== null) return false;
        const currentState = stateRef.current;
        const recentDocuments = promoteRecentDocument(
          currentState.recent.documents,
          { path: file.path, name: file.name },
        );
        dispatch({
          type: "commit-open",
          document: {
            name: file.name,
            path: file.path,
            markdown: file.content,
            loadedMarkdown: file.content,
            revision: file.revision,
            format: file.format,
            draftIdentity: getDocumentDraftIdentity(file.path),
            saveStatus: "saved",
            recovered: false,
            generation: current.generation + 1,
            editVersion: current.editVersion + 1,
          },
          note: loadDocumentNote(getDocumentNoteStorageKey(file.path)),
          recentDocuments,
          unavailablePaths: currentState.recent.unavailablePaths,
          persistenceLimited: !saveRecentDocuments(recentDocuments),
        });
        resetExternalFileStatus();
        handledExternalObservationRef.current = null;
        await discardDraft(current.draftIdentity).catch((error) => {
          console.error("교체한 새 문서의 복구 초안을 정리하지 못했습니다:", error);
        });
        events.emit("document-committed", {
          kind: "open",
          previousPath: null,
          path: file.path,
        });
        return true;
      }
      const commitToken = ++nextExternalCommitTokenRef.current;
      events.emit("external-content-will-apply", { commitToken });
      dispatch({
        type: "commit-reload",
        name: file.name,
        markdown: file.content,
        revision: file.revision,
        format: file.format,
        external: true,
      });
      resetExternalFileStatus();
      handledExternalObservationRef.current = null;
      await discardDraft(current.draftIdentity).catch((error) => {
        console.error("적용한 외부 변경의 복구 초안을 정리하지 못했습니다:", error);
      });
      events.emit("external-content-applied", { commitToken });
      return true;
    },
    [
      discardDraft,
      dispatch,
      events,
      handledExternalObservationRef,
      nextExternalCommitTokenRef,
      resetExternalFileStatus,
      stateRef,
    ],
  );

  const performSaveRef = useRef<
    (options?: SaveOptions) => Promise<boolean>
  >(async () => false);
  const performSave = useCallback(
    async (options?: SaveOptions): Promise<boolean> => {
      const snapshot = stateRef.current.document;
      let targetPath = options?.targetPath ?? snapshot.path;
      if (!targetPath) {
        targetPath = await chooseMarkdownSavePath(snapshot.name);
        if (!targetPath || !mountedRef.current) return false;
      }
      const scopedReader =
        targetPath === snapshot.path ? scopedDocumentReaderRef.current : null;

      dispatch({ type: "save-started" });
      try {
        if (scopedReader) {
          const verified = await scopedReader();
          if (verified.path !== snapshot.path) {
            throw new Error(
              "선택한 폴더 밖으로 변경된 Markdown은 저장할 수 없습니다.",
            );
          }
          targetPath = verified.path;
        }
        const result = await saveMarkdownFile({
          path: targetPath,
          content: snapshot.markdown,
          expectedRevision:
            options?.expectedRevision === undefined
              ? snapshot.path
                ? snapshot.revision
                : null
              : options.expectedRevision,
          format: snapshot.format,
        });
        if (!mountedRef.current) return false;
        if (!isSameDocumentContext(stateRef.current.document, snapshot)) return false;

        if (result.kind === "conflict") {
          dispatch({ type: "external-conflict" });
          if ((options?.conflictAttempt ?? 0) >= 1 || !result.revision) {
            await showError(
              "덮어쓰기를 확인한 뒤 원본이 다시 변경되었습니다. 최신 내용을 확인하고 다시 저장해 주세요.",
              "저장 충돌",
            );
            return false;
          }
          const decision = await chooseExternalConflictDecision(snapshot.name);
          if (!mountedRef.current || decision === "cancel") return false;
          if (decision === "external") {
            const external = await (scopedReader?.() ??
              readMarkdownFile(targetPath));
            return applyExternalFile(external);
          }
          return performSaveRef.current({
            targetPath,
            expectedRevision: result.revision,
            conflictAttempt: (options?.conflictAttempt ?? 0) + 1,
          });
        }

        const saved = result.document;
        const recentDocuments = promoteRecentDocument(
          stateRef.current.recent.documents,
          { path: saved.path, name: saved.name },
          snapshot.path ? [] : [targetPath],
        );
        dispatch({
          type: "commit-save",
          document: {
            name: saved.name,
            path: saved.path,
            loadedMarkdown: saved.content,
            revision: saved.revision,
            format: saved.format,
            draftIdentity: getDocumentDraftIdentity(saved.path),
          },
          savedEditVersion: snapshot.editVersion,
          recentDocuments,
          persistenceLimited: !saveRecentDocuments(recentDocuments),
        });
        resetExternalFileStatus();
        handledExternalObservationRef.current = null;
        const committed = stateRef.current.document;
        if (committed.editVersion === snapshot.editVersion) {
          await discardDraft(snapshot.draftIdentity);
        } else {
          await flushDraft({
            identity: committed.draftIdentity,
            path: committed.path,
            markdown: committed.markdown,
            loadedMarkdown: committed.loadedMarkdown,
            revision: committed.revision,
            generation: committed.generation,
          });
        }
        return true;
      } catch (error) {
        dispatch({ type: "save-failed" });
        await showError(error, "Markdown을 저장할 수 없습니다");
        return false;
      }
    },
    [
      applyExternalFile,
      discardDraft,
      dispatch,
      flushDraft,
      handledExternalObservationRef,
      mountedRef,
      resetExternalFileStatus,
      scopedDocumentReaderRef,
      showError,
      stateRef,
    ],
  );
  performSaveRef.current = performSave;

  const saveDocument = useCallback(async (): Promise<boolean> => {
    const current = stateRef.current.document;
    if (!isDocumentDirty(current) && current.path) return true;
    const operation = beginOperation("save");
    if (!operation) return false;
    try {
      const didSave = await performSave();
      return didSave && !isDocumentDirty(stateRef.current.document);
    } finally {
      finishOperation(operation);
    }
  }, [beginOperation, finishOperation, performSave, stateRef]);

  return { applyExternalFile, performSave, saveDocument };
}
