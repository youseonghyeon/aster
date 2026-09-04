import { useEffect, useRef } from "react";
import {
  capturePreviewReadingAnchor,
  restorePreviewReadingAnchor,
  type PreviewReadingAnchorSnapshot,
} from "../../lib/preview-scroll-anchor";
import { previewLayoutChangeEvent } from "../../lib/preview-layout-events";
import type { AppEventChannel } from "../../shared/app-events";

type UseReadingLayoutPreservationOptions = {
  events: AppEventChannel;
  previewElement: HTMLDivElement | null;
  suppressScrollSyncRestore: () => void;
};

const preservationLifetime = 1_000;

export function useReadingLayoutPreservation({
  events,
  previewElement,
  suppressScrollSyncRestore,
}: UseReadingLayoutPreservationOptions) {
  const transactionRef = useRef<{
    generation: number;
    snapshot: PreviewReadingAnchorSnapshot;
  } | null>(null);

  useEffect(() => {
    if (!previewElement) return;
    const preview = previewElement;

    let generation = 0;
    let expirationTimer: number | null = null;
    const animationFrames = new Set<number>();

    function cancelPendingRestoration() {
      generation += 1;
      transactionRef.current = null;
      animationFrames.forEach((frame) => window.cancelAnimationFrame(frame));
      animationFrames.clear();
      if (expirationTimer !== null) {
        window.clearTimeout(expirationTimer);
        expirationTimer = null;
      }
    }

    function restore(generationAtSchedule: number) {
      const transaction = transactionRef.current;
      if (
        !transaction ||
        transaction.generation !== generationAtSchedule ||
        !preview.isConnected
      ) {
        return;
      }

      suppressScrollSyncRestore();
      restorePreviewReadingAnchor(transaction.snapshot);
    }

    function scheduleRestoration(generationAtSchedule: number, frames = 1) {
      const frame = window.requestAnimationFrame(() => {
        animationFrames.delete(frame);
        restore(generationAtSchedule);
        if (frames > 1) {
          scheduleRestoration(generationAtSchedule, frames - 1);
        }
      });
      animationFrames.add(frame);
    }

    const unsubscribe = events.subscribe(
      "reading-layout-will-change",
      () => {
        cancelPendingRestoration();
        const transactionGeneration = generation;
        transactionRef.current = {
          generation: transactionGeneration,
          snapshot: capturePreviewReadingAnchor(preview),
        };
        scheduleRestoration(transactionGeneration, 2);
        expirationTimer = window.setTimeout(() => {
          if (
            transactionRef.current?.generation === transactionGeneration
          ) {
            cancelPendingRestoration();
          }
        }, preservationLifetime);
      },
    );
    const restoreAfterLayoutChange = () => {
      const transaction = transactionRef.current;
      if (transaction) scheduleRestoration(transaction.generation);
    };
    const cancelForUserIntent = () => cancelPendingRestoration();

    preview.addEventListener(
      previewLayoutChangeEvent,
      restoreAfterLayoutChange,
    );
    preview.addEventListener("wheel", cancelForUserIntent, {
      passive: true,
    });
    preview.addEventListener("touchstart", cancelForUserIntent, {
      passive: true,
    });
    preview.addEventListener("pointerdown", cancelForUserIntent, {
      passive: true,
    });
    preview.addEventListener("keydown", cancelForUserIntent);
    document.fonts.addEventListener("loadingdone", restoreAfterLayoutChange);

    return () => {
      cancelPendingRestoration();
      unsubscribe();
      preview.removeEventListener(
        previewLayoutChangeEvent,
        restoreAfterLayoutChange,
      );
      preview.removeEventListener("wheel", cancelForUserIntent);
      preview.removeEventListener("touchstart", cancelForUserIntent);
      preview.removeEventListener("pointerdown", cancelForUserIntent);
      preview.removeEventListener("keydown", cancelForUserIntent);
      document.fonts.removeEventListener(
        "loadingdone",
        restoreAfterLayoutChange,
      );
    };
  }, [events, previewElement, suppressScrollSyncRestore]);
}
