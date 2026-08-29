import { useEffect, useMemo, useRef, useState } from "react";
import {
  getMarkdownFileStatus,
  type MarkdownFileStatus,
} from "./markdown-files";

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
  const [externalFileState, setExternalFileStateValue] =
    useState<ExternalFileState | null>(null);
  const [dismissedObservationKey, setDismissedObservationKey] = useState<
    string | null
  >(null);
  const externalFileStateRef = useRef(externalFileState);
  const observationEpochRef = useRef(0);
  const deferredFirstCheckEpochRef = useRef<number | null>(null);
  const [observationEpoch, setObservationEpoch] = useState(0);
  const onBeforeNoticeRef = useRef(onBeforeNotice);
  externalFileStateRef.current = externalFileState;
  onBeforeNoticeRef.current = onBeforeNotice;

  useEffect(() => {
    if (!documentPath || !loadedRevision) {
      setExternalFileStateValue(null);
      setDismissedObservationKey(null);
      return;
    }

    const watchedDocumentPath = documentPath;
    const watchedRevision = loadedRevision;
    const watchedEpoch = observationEpoch;

    let isDisposed = false;
    let isChecking = false;
    let unavailableObservationCount = 0;
    let nextCheckTimer: number | undefined;

    function showExternalFileState(nextState: ExternalFileState) {
      if (
        watchedEpoch !== observationEpochRef.current ||
        externalFileStateRef.current?.observationKey ===
        nextState.observationKey
      ) {
        return;
      }

      onBeforeNoticeRef.current();
      externalFileStateRef.current = nextState;
      setExternalFileStateValue(nextState);
    }

    function scheduleNextCheck() {
      if (
        !isDisposed &&
        watchedEpoch === observationEpochRef.current &&
        document.visibilityState === "visible"
      ) {
        nextCheckTimer = window.setTimeout(checkFileStatus, 2000);
      }
    }

    async function checkFileStatus() {
      if (
        isDisposed ||
        watchedEpoch !== observationEpochRef.current ||
        isChecking ||
        document.visibilityState === "hidden"
      ) {
        return;
      }

      isChecking = true;

      try {
        const status = await getMarkdownFileStatus(watchedDocumentPath);

        if (isDisposed || watchedEpoch !== observationEpochRef.current) {
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
          setExternalFileStateValue(null);
          setDismissedObservationKey(null);
        } else if (observation.state) {
          showExternalFileState(observation.state);
        }
      } catch (error) {
        if (!isDisposed && watchedEpoch === observationEpochRef.current) {
          console.error("파일 상태를 확인할 수 없습니다:", error);
        }
      } finally {
        isChecking = false;
        scheduleNextCheck();
      }
    }

    function handleVisibilityChange() {
      if (
        watchedEpoch !== observationEpochRef.current ||
        document.visibilityState !== "visible" ||
        isChecking
      ) {
        return;
      }

      if (nextCheckTimer !== undefined) {
        window.clearTimeout(nextCheckTimer);
      }
      void checkFileStatus();
    }

    if (deferredFirstCheckEpochRef.current === watchedEpoch) {
      deferredFirstCheckEpochRef.current = null;
      scheduleNextCheck();
    } else {
      void checkFileStatus();
    }
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      isDisposed = true;
      if (nextCheckTimer !== undefined) {
        window.clearTimeout(nextCheckTimer);
      }
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [documentPath, loadedRevision, observationEpoch]);

  const visibleExternalFileState = useMemo(
    () =>
      externalFileState?.observationKey === dismissedObservationKey
        ? null
        : externalFileState,
    [dismissedObservationKey, externalFileState],
  );

  function resetExternalFileStatus() {
    const nextEpoch = observationEpochRef.current + 1;
    observationEpochRef.current = nextEpoch;
    externalFileStateRef.current = null;
    setExternalFileStateValue(null);
    setDismissedObservationKey(null);
    setObservationEpoch(nextEpoch);
  }

  function setExternalFileState(nextState: ExternalFileState) {
    const nextEpoch = observationEpochRef.current + 1;
    observationEpochRef.current = nextEpoch;
    deferredFirstCheckEpochRef.current = nextEpoch;
    externalFileStateRef.current = nextState;
    setExternalFileStateValue(nextState);
    setObservationEpoch(nextEpoch);
  }

  return {
    externalFileState,
    visibleExternalFileState,
    setExternalFileState,
    setDismissedExternalObservationKey: setDismissedObservationKey,
    resetExternalFileStatus,
  };
}
