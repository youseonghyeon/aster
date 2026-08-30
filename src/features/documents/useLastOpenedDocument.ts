import { useEffect, useRef, useState } from "react";
import type { DocumentOpenOutcome } from "../../shared/app-events";
import {
  clearLastOpenedDocumentPath,
  loadInitialDocumentPath,
  saveLastOpenedDocumentPath,
} from "./last-opened-document";
import { isDesktopRuntime } from "./markdown-files";

type UseLastOpenedDocumentOptions = {
  documentPath: string | null;
  fallbackDocumentPath: string | null;
  openDocument: (
    path: string,
    source: "startup",
  ) => Promise<DocumentOpenOutcome>;
};

export function useLastOpenedDocument({
  documentPath,
  fallbackDocumentPath,
  openDocument,
}: UseLastOpenedDocumentOptions) {
  const [initialStoredDocumentPath] = useState(() =>
    loadInitialDocumentPath(fallbackDocumentPath),
  );
  const [isRestoring, setIsRestoring] = useState(
    () => initialStoredDocumentPath !== null && isDesktopRuntime(),
  );
  const restoreCheckedRef = useRef(false);
  const openDocumentRef = useRef(openDocument);
  openDocumentRef.current = openDocument;

  useEffect(() => {
    if (!isRestoring || restoreCheckedRef.current || !isDesktopRuntime()) {
      return;
    }
    if (!initialStoredDocumentPath) return;
    let disposed = false;

    const restoreTimer = window.setTimeout(() => {
      if (restoreCheckedRef.current) return;
      restoreCheckedRef.current = true;
      void (async () => {
        try {
          const outcome = await openDocumentRef.current(
            initialStoredDocumentPath,
            "startup",
          );
          if (outcome === "failed") clearLastOpenedDocumentPath();
        } catch (error) {
          console.error("마지막 문서를 복원하지 못했습니다:", error);
        } finally {
          if (!disposed) setIsRestoring(false);
        }
      })();
    }, 0);

    return () => {
      disposed = true;
      window.clearTimeout(restoreTimer);
    };
  }, [initialStoredDocumentPath, isRestoring]);

  useEffect(() => {
    if (documentPath) saveLastOpenedDocumentPath(documentPath);
  }, [documentPath]);

  return {
    hasStoredDocument: initialStoredDocumentPath !== null,
    isRestoring,
  };
}
