import { useLayoutEffect, useRef } from "react";
import {
  capturePreviewReadingAnchor,
  remapPreviewReadingAnchor,
  restorePreviewReadingAnchor,
  type PreviewReadingAnchorSnapshot,
} from "../../lib/preview-scroll-anchor";
import { createReadingOffsetMapper } from "../../lib/reading-anchor-mapping";
import {
  captureReadingScrollRegions,
  remapReadingScrollRegions,
  restoreReadingScrollRegions,
} from "../../lib/reading-scroll-regions";
import { previewLayoutChangeEvent } from "../../lib/preview-layout-events";
import type { AppEventChannel } from "../../shared/app-events";

type UseReadingLayoutPreservationOptions = {
  events: AppEventChannel;
  previewElement: HTMLDivElement | null;
  suppressScrollSyncRestore: () => void;
  markdown?: string;
  documentPath?: string | null;
  isPreviewUpdating?: boolean;
  layoutKey?: string;
};

type ReadingSnapshot = {
  anchor: PreviewReadingAnchorSnapshot;
  regions: ReturnType<typeof captureReadingScrollRegions>;
  markdown: string;
  path: string | null;
};

function layoutSignature(preview: HTMLElement) {
  const body = preview.querySelector<HTMLElement>(".markdown-body");
  return [preview.clientWidth, preview.clientHeight, preview.scrollHeight,
    body?.getBoundingClientRect().width, body?.getBoundingClientRect().height].join(":");
}

/** Owns preview restoration; scroll sync and focus restoration must not also own it. */
export function useReadingLayoutPreservation({
  events,
  previewElement,
  suppressScrollSyncRestore,
  markdown = "",
  documentPath = null,
  isPreviewUpdating = false,
  layoutKey = "",
}: UseReadingLayoutPreservationOptions) {
  const inputsRef = useRef({ markdown, documentPath, isPreviewUpdating });
  const snapshotRef = useRef<ReadingSnapshot | null>(null);
  const externalTokenRef = useRef<number | null>(null);
  const appliedTokenRef = useRef<number | null>(null);
  const controlsRef = useRef<{ commit: () => void } | null>(null);

  useLayoutEffect(() => {
    inputsRef.current = { markdown, documentPath, isPreviewUpdating };
  });

  useLayoutEffect(() => {
    if (!previewElement) return;
    const preview = previewElement;
    let frame: number | null = null;
    let disposed = false;
    let signature = layoutSignature(preview);
    let expectedTop: number | null = null;
    let captureOnFrame = false;

    function isCurrentPreview() {
      const current = inputsRef.current;
      return !disposed && preview.isConnected && !current.isPreviewUpdating &&
        (!preview.hasAttribute("data-document-path") ||
          preview.dataset.documentPath === (current.documentPath ?? ""));
    }

    function capture() {
      if (!isCurrentPreview()) return;
      const current = inputsRef.current;
      snapshotRef.current = {
        anchor: capturePreviewReadingAnchor(preview),
        regions: captureReadingScrollRegions(preview),
        markdown: current.markdown,
        path: current.documentPath,
      };
      signature = layoutSignature(preview);
    }

    function restore() {
      if (!isCurrentPreview()) return;
      const snapshot = snapshotRef.current;
      const current = inputsRef.current;
      if (!snapshot || snapshot.path !== current.documentPath || snapshot.markdown !== current.markdown) {
        capture();
        return;
      }
      suppressScrollSyncRestore();
      // Preview can remount on a pane swap; source identities survive that remount.
      snapshot.anchor.container = preview;
      restoreReadingScrollRegions(preview, snapshot.regions);
      restorePreviewReadingAnchor(snapshot.anchor);
      signature = layoutSignature(preview);
      expectedTop = preview.scrollTop;
    }

    function schedule(shouldCapture = false) {
      captureOnFrame ||= shouldCapture;
      if (frame !== null) return;
      frame = window.requestAnimationFrame(() => {
        frame = null;
        const recapture = captureOnFrame;
        captureOnFrame = false;
        if (recapture) capture();
        else commit();
      });
    }

    function cancelFrame() {
      if (frame !== null) window.cancelAnimationFrame(frame);
      frame = null;
      captureOnFrame = false;
    }

    function cancelForNavigation() {
      cancelFrame();
      snapshotRef.current = null;
      expectedTop = null;
      // Cancel a reload too: its delayed completion must not undo the user's input.
      externalTokenRef.current = null;
      appliedTokenRef.current = null;
      schedule(true);
    }

    function beforeLayoutChange() {
      const hasUnrestoredLayout = frame !== null || layoutSignature(preview) !== signature;
      cancelFrame();
      if (externalTokenRef.current === null && !hasUnrestoredLayout) capture();
      suppressScrollSyncRestore();
      schedule();
    }

    function commit() {
      if (!isCurrentPreview()) return;
      const current = inputsRef.current;
      const snapshot = snapshotRef.current;
      if (snapshot && snapshot.path !== current.documentPath) {
        externalTokenRef.current = null;
        appliedTokenRef.current = null;
        capture();
        return;
      }
      if (snapshot && snapshot.path === current.documentPath && snapshot.markdown !== current.markdown &&
        externalTokenRef.current !== null) {
        const mapOffset = createReadingOffsetMapper(snapshot.markdown, current.markdown);
        snapshot.anchor = remapPreviewReadingAnchor(snapshot.anchor, mapOffset);
        snapshot.regions = remapReadingScrollRegions(snapshot.regions, mapOffset);
        snapshot.markdown = current.markdown;
        externalTokenRef.current = null;
      }
      if (appliedTokenRef.current === externalTokenRef.current) externalTokenRef.current = null;
      restore();
    }
    controlsRef.current = { commit };

    const unsubscribeLayout = events.subscribe("reading-layout-will-change", beforeLayoutChange);
    const unsubscribeExternal = events.subscribe("external-content-will-apply", ({ commitToken }) => {
      cancelFrame();
      if (externalTokenRef.current === null) capture();
      externalTokenRef.current = commitToken;
      suppressScrollSyncRestore();
    });
    const unsubscribeApplied = events.subscribe("external-content-applied", ({ commitToken }) => {
      if (externalTokenRef.current !== commitToken) return;
      appliedTokenRef.current = commitToken;
      schedule();
    });
    const unsubscribeDocument = events.subscribe("document-committed", cancelForNavigation);
    const unsubscribeNavigation = events.subscribe("reading-navigation-will-change", cancelForNavigation);

    function afterLayoutChange() {
      // Don't replace a pending user-intent capture with an old anchor.
      if (snapshotRef.current) schedule();
    }
    function onScroll(event: Event) {
      if (!isCurrentPreview()) return;
      if (layoutSignature(preview) !== signature && snapshotRef.current) {
        afterLayoutChange();
        return;
      }
      if (event.target === preview && expectedTop !== null && Math.abs(preview.scrollTop - expectedTop) < 1) return;
      expectedTop = null;
      cancelFrame();
      capture();
    }
    const resizeObserver = new ResizeObserver(afterLayoutChange);
    resizeObserver.observe(preview);
    const body = preview.querySelector<HTMLElement>(".markdown-body");
    if (body) resizeObserver.observe(body);
    const mutationObserver = new MutationObserver(afterLayoutChange);
    if (body) mutationObserver.observe(body, {
      childList: true, subtree: true, characterData: true, attributes: true,
      attributeFilter: ["class", "style", "src", "open"],
    });
    preview.addEventListener(previewLayoutChangeEvent, afterLayoutChange);
    preview.addEventListener("load", afterLayoutChange, true);
    preview.addEventListener("error", afterLayoutChange, true);
    preview.addEventListener("scroll", onScroll, true);
    preview.addEventListener("wheel", cancelForNavigation, { passive: true });
    preview.addEventListener("touchstart", cancelForNavigation, { passive: true });
    preview.addEventListener("pointerdown", cancelForNavigation, { passive: true });
    preview.addEventListener("keydown", cancelForNavigation);
    document.fonts.addEventListener("loadingdone", afterLayoutChange);

    // A cached anchor predates native resize callbacks and React layout commits.
    if (snapshotRef.current) commit();
    else capture();
    return () => {
      disposed = true;
      cancelFrame();
      controlsRef.current = null;
      unsubscribeLayout();
      unsubscribeExternal();
      unsubscribeApplied();
      unsubscribeDocument();
      unsubscribeNavigation();
      resizeObserver.disconnect();
      mutationObserver.disconnect();
      preview.removeEventListener(previewLayoutChangeEvent, afterLayoutChange);
      preview.removeEventListener("load", afterLayoutChange, true);
      preview.removeEventListener("error", afterLayoutChange, true);
      preview.removeEventListener("scroll", onScroll, true);
      preview.removeEventListener("wheel", cancelForNavigation);
      preview.removeEventListener("touchstart", cancelForNavigation);
      preview.removeEventListener("pointerdown", cancelForNavigation);
      preview.removeEventListener("keydown", cancelForNavigation);
      document.fonts.removeEventListener("loadingdone", afterLayoutChange);
    };
  }, [events, previewElement, suppressScrollSyncRestore]);

  useLayoutEffect(() => {
    controlsRef.current?.commit();
  }, [markdown, documentPath, isPreviewUpdating, layoutKey, previewElement]);
}
