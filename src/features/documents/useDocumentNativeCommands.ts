import { listen } from "@tauri-apps/api/event";
import { useEffect, useRef, type RefObject } from "react";
import type { DocumentOpenOutcome } from "../../shared/app-events";
import { isDesktopRuntime, takeSystemOpenRequest } from "./markdown-files";

type NativeOpen = (
  source: "picker" | "native",
) => Promise<DocumentOpenOutcome>;

type SystemOpen = (
  path: string,
  source: "system",
) => Promise<DocumentOpenOutcome>;

export function useDocumentNativeCommands({
  isBlockingModalOpen,
  openFromPickerRef,
  openSystemDocument,
  saveDocumentRef,
}: {
  isBlockingModalOpen: () => boolean;
  openFromPickerRef: RefObject<NativeOpen>;
  openSystemDocument: SystemOpen | null;
  saveDocumentRef: RefObject<() => Promise<boolean>>;
}) {
  const canOpenSystemDocument = openSystemDocument !== null;
  const openSystemDocumentRef = useRef(openSystemDocument);
  const retrySystemPathRef = useRef<string | null>(null);
  const takeSystemRequestRef = useRef<() => void>(() => undefined);
  openSystemDocumentRef.current = openSystemDocument;
  takeSystemRequestRef.current = () => {
    if (!openSystemDocumentRef.current || !isDesktopRuntime()) return;
    const retryPath = retrySystemPathRef.current;
    retrySystemPathRef.current = null;
    void takeSystemOpenRequest()
      .then((requestedPath) => {
        const path = requestedPath ?? retryPath;
        if (!path) return;
        const open = openSystemDocumentRef.current;
        if (!open) {
          retrySystemPathRef.current = path;
          return;
        }
        if (isBlockingModalOpen()) return;
        void open(path, "system").then((outcome) => {
          if (outcome === "busy") retrySystemPathRef.current ??= path;
        });
      })
      .catch((error) => {
        console.error("Finder에서 연 문서를 가져오지 못했습니다.", error);
      });
  };

  useEffect(() => {
    if (canOpenSystemDocument) takeSystemRequestRef.current();
  }, [canOpenSystemDocument]);

  useEffect(() => {
    let disposed = false;
    const listeners: Array<() => void> = [];
    const register = (
      eventName: string,
      listener: () => void,
      onRegistered?: () => void,
    ) => {
      void listen(eventName, listener)
        .then((unlisten) => {
          if (disposed) unlisten();
          else {
            listeners.push(unlisten);
            onRegistered?.();
          }
        })
        .catch((error) => {
          if (!disposed) {
            console.error(`${eventName} 이벤트를 연결하지 못했습니다.`, error);
          }
        });
    };
    register("open-markdown-requested", () => {
      if (!isBlockingModalOpen()) void openFromPickerRef.current("native");
    });
    register("save-markdown-requested", () => {
      if (!isBlockingModalOpen()) void saveDocumentRef.current();
    });
    const takeSystemRequest = () => takeSystemRequestRef.current();
    register("system-open-requested", takeSystemRequest, takeSystemRequest);
    return () => {
      disposed = true;
      listeners.forEach((unlisten) => unlisten());
    };
  }, [isBlockingModalOpen, openFromPickerRef, saveDocumentRef]);
}
