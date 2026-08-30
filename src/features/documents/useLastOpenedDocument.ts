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
  const restoreCheckedRef = useRef(false);

  useEffect(() => {
    if (restoreCheckedRef.current || !isDesktopRuntime()) return;
    if (!initialStoredDocumentPath) return;

    const restoreTimer = window.setTimeout(() => {
      if (restoreCheckedRef.current) return;
      restoreCheckedRef.current = true;
      void openDocument(initialStoredDocumentPath, "startup").then((outcome) => {
        if (outcome === "failed") clearLastOpenedDocumentPath();
      }).catch((error) => {
        console.error("마지막 문서를 복원하지 못했습니다:", error);
      });
    }, 0);

    return () => window.clearTimeout(restoreTimer);
  }, [initialStoredDocumentPath, openDocument]);

  useEffect(() => {
    if (documentPath) saveLastOpenedDocumentPath(documentPath);
  }, [documentPath]);

  return { hasStoredDocument: initialStoredDocumentPath !== null };
}
