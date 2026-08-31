import { listen } from "@tauri-apps/api/event";
import { useEffect, type RefObject } from "react";
import type { DocumentOpenOutcome } from "../../shared/app-events";

type NativeOpen = (
  source: "picker" | "native",
) => Promise<DocumentOpenOutcome>;

export function useDocumentNativeCommands({
  isBlockingModalOpen,
  openFromPickerRef,
  saveDocumentRef,
}: {
  isBlockingModalOpen: () => boolean;
  openFromPickerRef: RefObject<NativeOpen>;
  saveDocumentRef: RefObject<() => Promise<boolean>>;
}) {
  useEffect(() => {
    let disposed = false;
    const listeners: Array<() => void> = [];
    const register = (eventName: string, listener: () => void) => {
      void listen(eventName, listener)
        .then((unlisten) => {
          if (disposed) unlisten();
          else listeners.push(unlisten);
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
    return () => {
      disposed = true;
      listeners.forEach((unlisten) => unlisten());
    };
  }, [isBlockingModalOpen, openFromPickerRef, saveDocumentRef]);
}
