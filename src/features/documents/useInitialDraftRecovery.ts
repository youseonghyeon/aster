import { useEffect, useRef, type RefObject } from "react";
import type {
  DocumentOperation,
  DocumentOperationKind,
  DocumentSessionAction,
  DocumentSessionState,
} from "./document-session-state";
import { isSameDocumentContext } from "./document-transactions";
import { initialMarkdown } from "./initial-document";
import {
  chooseRecoveryDecision,
  isDesktopRuntime,
  type RecoveryDraft,
} from "./markdown-files";

export function useInitialDraftRecovery({
  hasStoredDocument,
  stateRef,
  mountedRef,
  dispatch,
  beginOperation,
  finishOperation,
  loadDraft,
  discardDraft,
}: {
  hasStoredDocument: boolean;
  stateRef: RefObject<DocumentSessionState>;
  mountedRef: RefObject<boolean>;
  dispatch: (action: DocumentSessionAction) => void;
  beginOperation: (kind: DocumentOperationKind) => DocumentOperation | null;
  finishOperation: (operation: DocumentOperation) => void;
  loadDraft: (identity: string) => Promise<RecoveryDraft | null>;
  discardDraft: (identity?: string) => Promise<unknown>;
}) {
  const checkedRef = useRef(false);

  useEffect(() => {
    if (checkedRef.current || !isDesktopRuntime()) return;
    checkedRef.current = true;
    if (hasStoredDocument) return;
    const operation = beginOperation("recovery");
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
      .catch((error) => console.error("새 문서 복구 초안을 확인하지 못했습니다:", error))
      .finally(() => {
        if (operation) finishOperation(operation);
      });
  }, [
    beginOperation,
    discardDraft,
    dispatch,
    finishOperation,
    hasStoredDocument,
    loadDraft,
    mountedRef,
    stateRef,
  ]);
}
