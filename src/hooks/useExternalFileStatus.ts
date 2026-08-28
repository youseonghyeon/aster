import { useEffect, useMemo, useRef, useState } from "react";
import {
  getMarkdownFileStatus,
  type MarkdownFileStatus,
} from "../services/markdown-files";

export type ExternalFileState =
  | { kind: "modified"; revision: string; observationKey: string }
  | { kind: "unavailable"; message: string; observationKey: string };

type UseExternalFileStatusOptions = {
  documentPath: string | null;
  loadedRevision: string | null;
  onBeforeNotice: () => void;
};

export function getExternalFileObservation(
  status: MarkdownFileStatus,
  loadedRevision: string,
  unavailableObservationCount: number,
): {
  state: ExternalFileState | null | undefined;
  unavailableObservationCount: number;
} {
  if (status.kind === "available") {
    return status.revision === loadedRevision
      ? { state: null, unavailableObservationCount: 0 }
      : {
          state: {
            kind: "modified",
            revision: status.revision,
            observationKey: `modified:${status.revision}`,
          },
          unavailableObservationCount: 0,
        };
  }

  const nextUnavailableObservationCount = unavailableObservationCount + 1;
  return {
    state:
      nextUnavailableObservationCount >= 2
        ? {
            kind: "unavailable",
            message: status.message,
            observationKey: `unavailable:${status.message}`,
          }
        : undefined,
    unavailableObservationCount: nextUnavailableObservationCount,
  };
}

export function useExternalFileStatus({
  documentPath,
  loadedRevision,
  onBeforeNotice,
}: UseExternalFileStatusOptions) {
  const [externalFileState, setExternalFileState] =
    useState<ExternalFileState | null>(null);
  const [dismissedObservationKey, setDismissedObservationKey] = useState<
    string | null
  >(null);
  const externalFileStateRef = useRef(externalFileState);
  const onBeforeNoticeRef = useRef(onBeforeNotice);
  externalFileStateRef.current = externalFileState;
  onBeforeNoticeRef.current = onBeforeNotice;

  useEffect(() => {
    if (!documentPath || !loadedRevision) {
      setExternalFileState(null);
      setDismissedObservationKey(null);
      return;
    }

    const watchedDocumentPath = documentPath;
    const watchedRevision = loadedRevision;

    let isDisposed = false;
    let isChecking = false;
    let unavailableObservationCount = 0;
    let nextCheckTimer: number | undefined;

    function showExternalFileState(nextState: ExternalFileState) {
      if (
        externalFileStateRef.current?.observationKey ===
        nextState.observationKey
      ) {
        return;
      }

      onBeforeNoticeRef.current();
      externalFileStateRef.current = nextState;
      setExternalFileState(nextState);
    }

    function scheduleNextCheck() {
      if (!isDisposed && document.visibilityState === "visible") {
        nextCheckTimer = window.setTimeout(checkFileStatus, 2000);
      }
    }

    async function checkFileStatus() {
      if (isDisposed || isChecking || document.visibilityState === "hidden") {
        return;
      }

      isChecking = true;

      try {
        const status = await getMarkdownFileStatus(watchedDocumentPath);

        if (isDisposed) {
          return;
        }

        const observation = getExternalFileObservation(
          status,
          watchedRevision,
          unavailableObservationCount,
        );
        unavailableObservationCount = observation.unavailableObservationCount;

        if (observation.state === null) {
          externalFileStateRef.current = null;
          setExternalFileState(null);
          setDismissedObservationKey(null);
        } else if (observation.state) {
          showExternalFileState(observation.state);
        }
      } catch (error) {
        if (!isDisposed) {
          console.error("파일 상태를 확인할 수 없습니다:", error);
        }
      } finally {
        isChecking = false;
        scheduleNextCheck();
      }
    }

    function handleVisibilityChange() {
      if (document.visibilityState !== "visible" || isChecking) {
        return;
      }

      if (nextCheckTimer !== undefined) {
        window.clearTimeout(nextCheckTimer);
      }
      void checkFileStatus();
    }

    void checkFileStatus();
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      isDisposed = true;
      if (nextCheckTimer !== undefined) {
        window.clearTimeout(nextCheckTimer);
      }
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [documentPath, loadedRevision]);

  const visibleExternalFileState = useMemo(
    () =>
      externalFileState?.observationKey === dismissedObservationKey
        ? null
        : externalFileState,
    [dismissedObservationKey, externalFileState],
  );

  function resetExternalFileStatus() {
    externalFileStateRef.current = null;
    setExternalFileState(null);
    setDismissedObservationKey(null);
  }

  return {
    externalFileState,
    visibleExternalFileState,
    setExternalFileState,
    setDismissedExternalObservationKey: setDismissedObservationKey,
    resetExternalFileStatus,
  };
}
