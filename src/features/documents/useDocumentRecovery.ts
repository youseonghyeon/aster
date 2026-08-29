import { useCallback, useEffect, useRef } from "react";
import {
  deleteRecoveryDraft,
  isDesktopRuntime,
  loadRecoveryDraft,
  saveRecoveryDraft,
  type RecoveryDraft,
} from "./markdown-files";

export type RecoveryDocumentSnapshot = {
  identity: string;
  path: string | null;
  markdown: string;
  loadedMarkdown: string | null;
  revision: string | null;
  generation: number;
};

export function useDocumentRecovery(
  snapshot: RecoveryDocumentSnapshot,
  onError: (message: string) => void,
) {
  const sequenceRef = useRef(Date.now() * 1000);
  const timerRef = useRef<number | null>(null);
  const snapshotRef = useRef(snapshot);
  const suppressedSnapshotRef = useRef<{
    identity: string;
    markdown: string;
  } | null>(null);
  const onErrorRef = useRef(onError);
  snapshotRef.current = snapshot;
  onErrorRef.current = onError;

  const nextSequence = useCallback(() => {
    sequenceRef.current += 1;
    return sequenceRef.current;
  }, []);

  const flushDraft = useCallback(async (override?: RecoveryDocumentSnapshot) => {
    if (!isDesktopRuntime()) return;
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    const current = override ?? snapshotRef.current;
    const suppressed = suppressedSnapshotRef.current;
    if (
      suppressed?.identity === current.identity &&
      suppressed.markdown === current.markdown
    ) {
      return;
    }
    if (suppressed) suppressedSnapshotRef.current = null;
    if (current.markdown === current.loadedMarkdown) return;
    const sequence = nextSequence();
    try {
      await saveRecoveryDraft({
        identity: current.identity,
        path: current.path,
        content: current.markdown,
        baseRevision: current.revision,
        sequence,
      });
    } catch (error) {
      onErrorRef.current(error instanceof Error ? error.message : String(error));
    }
  }, [nextSequence]);

  const discardDraft = useCallback(
    async (identity = snapshotRef.current.identity) => {
      if (!isDesktopRuntime()) return null;
      if (identity === snapshotRef.current.identity) {
        if (timerRef.current !== null) {
          window.clearTimeout(timerRef.current);
          timerRef.current = null;
        }
        suppressedSnapshotRef.current = {
          identity,
          markdown: snapshotRef.current.markdown,
        };
      }
      const sequence = nextSequence();
      await deleteRecoveryDraft(identity, sequence);
      return { identity, sequence };
    },
    [nextSequence],
  );

  const reserveDiscardFence = useCallback(
    (identity = snapshotRef.current.identity) => {
      if (identity === snapshotRef.current.identity) {
        if (timerRef.current !== null) {
          window.clearTimeout(timerRef.current);
          timerRef.current = null;
        }
        suppressedSnapshotRef.current = {
          identity,
          markdown: snapshotRef.current.markdown,
        };
      }
      return { identity, sequence: nextSequence() };
    },
    [nextSequence],
  );

  const loadDraft = useCallback(async (identity: string): Promise<RecoveryDraft | null> => {
    if (!isDesktopRuntime()) return null;
    return loadRecoveryDraft(identity);
  }, []);

  useEffect(() => {
    if (!isDesktopRuntime()) return;
    if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    if (snapshot.markdown === snapshot.loadedMarkdown) return;
    timerRef.current = window.setTimeout(() => {
      timerRef.current = null;
      void flushDraft();
    }, 250);
    return () => {
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [flushDraft, snapshot.generation, snapshot.markdown]);

  useEffect(() => {
    function handlePageExitSignal() {
      void flushDraft();
    }
    window.addEventListener("blur", handlePageExitSignal);
    document.addEventListener("visibilitychange", handlePageExitSignal);
    return () => {
      window.removeEventListener("blur", handlePageExitSignal);
      document.removeEventListener("visibilitychange", handlePageExitSignal);
    };
  }, [flushDraft]);

  return { flushDraft, discardDraft, reserveDiscardFence, loadDraft };
}
