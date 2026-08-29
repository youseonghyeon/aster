import { listen } from "@tauri-apps/api/event";
import { useEffect, useRef } from "react";
import {
  enableCloseGuard,
  isDesktopRuntime,
  resolveCloseRequest,
} from "./markdown-files";

export type CloseApproval = {
  allow: boolean;
  discardDraft?: { identity: string; sequence: number } | null;
};

export function useDocumentCloseGuard(
  decideClose: () => Promise<CloseApproval>,
) {
  const decideCloseRef = useRef(decideClose);
  const pendingRequestRef = useRef<number | null>(null);
  decideCloseRef.current = decideClose;

  useEffect(() => {
    if (!isDesktopRuntime()) return;
    let disposed = false;
    let stopListening: (() => void) | undefined;

    void listen<number>("app-close-requested", async ({ payload }) => {
      if (disposed || pendingRequestRef.current !== null) return;
      pendingRequestRef.current = payload;
      try {
        const approval = await decideCloseRef.current();
        if (disposed) return;
        await resolveCloseRequest({ requestId: payload, ...approval });
      } catch (error) {
        if (!disposed) {
          console.error("앱 종료 요청을 처리하지 못했습니다:", error);
          await resolveCloseRequest({ requestId: payload, allow: false }).catch(
            () => undefined,
          );
        }
      } finally {
        if (pendingRequestRef.current === payload) {
          pendingRequestRef.current = null;
        }
      }
    })
      .then(async (unlisten) => {
        if (disposed) {
          unlisten();
          return;
        }
        stopListening = unlisten;
        await enableCloseGuard();
      })
      .catch((error) => {
        if (!disposed) {
          console.error("앱 종료 보호를 시작하지 못했습니다:", error);
        }
      });

    return () => {
      disposed = true;
      stopListening?.();
      const requestId = pendingRequestRef.current;
      pendingRequestRef.current = null;
      if (requestId !== null) {
        void resolveCloseRequest({ requestId, allow: false });
      }
    };
  }, []);
}
