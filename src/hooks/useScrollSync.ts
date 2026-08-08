import { useCallback, useLayoutEffect, useRef } from "react";
import {
  createScrollSyncMap,
  mapScrollPosition,
  maximumScrollSyncAnchors,
  sampleSourceOffsets,
  type ScrollSyncMap,
  type ScrollSyncPoint,
} from "../lib/scroll-sync";

type ScrollSide = "editor" | "preview";

type ExpectedScroll = {
  element: HTMLElement;
  target: number;
  epoch: number;
  expiresAt: number;
};

type SourceCoordinateCache = {
  markdown: string;
  signature: string;
  positions: Map<number, number>;
};

type UseScrollSyncOptions = {
  enabled: boolean;
  active: boolean;
  markdown: string;
  editorElement: HTMLTextAreaElement | null;
  previewElement: HTMLDivElement | null;
};

type ScrollSyncControls = {
  enable: () => void;
  disable: () => void;
};

const quietMeasurementDelay = 140;
const userOwnershipDuration = 420;
const expectedTargetTolerance = 2;

const mirrorStyleProperties = [
  "direction",
  "font",
  "fontFamily",
  "fontFeatureSettings",
  "fontKerning",
  "fontSize",
  "fontStretch",
  "fontStyle",
  "fontVariant",
  "fontVariationSettings",
  "fontWeight",
  "letterSpacing",
  "lineHeight",
  "overflowWrap",
  "paddingBottom",
  "paddingLeft",
  "paddingRight",
  "paddingTop",
  "tabSize",
  "textAlign",
  "textIndent",
  "textRendering",
  "textTransform",
  "whiteSpace",
  "wordBreak",
  "wordSpacing",
] as const;

function maximumScrollTop(element: HTMLElement) {
  return Math.max(0, element.scrollHeight - element.clientHeight);
}

function getPreviewAnchorCoordinates(
  previewElement: HTMLDivElement,
  markdownLength: number,
) {
  const previewRect = previewElement.getBoundingClientRect();
  const previewMax = maximumScrollTop(previewElement);
  const positions = new Map<number, number>();

  previewElement
    .querySelectorAll<HTMLElement>(".markdown-body [data-source-offset]")
    .forEach((anchor) => {
      const sourceOffset = Number(anchor.dataset.sourceOffset);

      if (
        !Number.isFinite(sourceOffset) ||
        sourceOffset <= 0 ||
        sourceOffset >= markdownLength
      ) {
        return;
      }

      const anchorRect = anchor.getBoundingClientRect();
      const previewY = Math.min(
        previewMax,
        Math.max(
          0,
          previewElement.scrollTop + anchorRect.top - previewRect.top,
        ),
      );
      const previousY = positions.get(sourceOffset);

      if (previousY === undefined || previewY < previousY) {
        positions.set(sourceOffset, previewY);
      }
    });

  return positions;
}

function getMirrorSignature(
  editorElement: HTMLTextAreaElement,
  offsets: number[],
) {
  const style = window.getComputedStyle(editorElement);
  const styleSignature = mirrorStyleProperties
    .map((property) => style[property])
    .join("|");

  return [
    editorElement.clientWidth,
    editorElement.clientHeight,
    editorElement.scrollHeight,
    styleSignature,
    offsets.join(","),
  ].join("\u0001");
}

function measureEditorCoordinates(
  editorElement: HTMLTextAreaElement,
  markdown: string,
  offsets: number[],
) {
  const computedStyle = window.getComputedStyle(editorElement);
  const mirror = document.createElement("div");
  const textNode = document.createTextNode(markdown || " ");

  mirror.setAttribute("aria-hidden", "true");
  Object.assign(mirror.style, {
    position: "fixed",
    top: "0",
    left: "-100000px",
    width: `${editorElement.clientWidth}px`,
    height: "auto",
    minHeight: "0",
    margin: "0",
    border: "0",
    boxSizing: "border-box",
    overflow: "visible",
    pointerEvents: "none",
    visibility: "hidden",
  });

  mirrorStyleProperties.forEach((property) => {
    mirror.style.setProperty(
      property.replace(/[A-Z]/g, (character) => `-${character.toLowerCase()}`),
      computedStyle[property],
    );
  });
  mirror.style.whiteSpace = "pre-wrap";
  mirror.style.overflowWrap = computedStyle.overflowWrap || "break-word";
  mirror.append(textNode);
  document.body.append(mirror);

  const mirrorRect = mirror.getBoundingClientRect();
  const editorMax = maximumScrollTop(editorElement);
  const positions = new Map<number, number>();

  offsets.forEach((offset) => {
    const boundedOffset = Math.min(markdown.length, Math.max(0, offset));
    const range = document.createRange();
    const rangeEnd = Math.min(markdown.length, boundedOffset + 1);

    range.setStart(textNode, boundedOffset);
    range.setEnd(textNode, rangeEnd);
    const rangeRect = range.getBoundingClientRect();
    const editorY = Math.min(
      editorMax,
      Math.max(0, rangeRect.top - mirrorRect.top),
    );

    positions.set(offset, editorY);
    range.detach();
  });

  mirror.remove();
  return positions;
}

function isScrollOwnershipKey(event: globalThis.KeyboardEvent) {
  if (event.metaKey || event.ctrlKey || event.altKey) {
    return false;
  }

  if (event.key === " " && event.currentTarget instanceof HTMLTextAreaElement) {
    return false;
  }

  return [
    "ArrowUp",
    "ArrowDown",
    "PageUp",
    "PageDown",
    "Home",
    "End",
    " ",
  ].includes(event.key);
}

export function useScrollSync({
  enabled,
  active,
  markdown,
  editorElement,
  previewElement,
}: UseScrollSyncOptions) {
  const epochRef = useRef(0);
  const enabledRef = useRef(enabled);
  const suppressionUntilRef = useRef(0);
  const sourceCoordinateCacheRef = useRef<SourceCoordinateCache | null>(null);
  const controlsRef = useRef<ScrollSyncControls | null>(null);
  enabledRef.current = enabled;

  const suppressScrollSyncRestore = useCallback(() => {
    suppressionUntilRef.current = performance.now() + quietMeasurementDelay;
  }, []);

  useLayoutEffect(() => {
    epochRef.current += 1;
    const epoch = epochRef.current;

    if (sourceCoordinateCacheRef.current?.markdown !== markdown) {
      sourceCoordinateCacheRef.current = null;
    }

    if (!active || !editorElement || !previewElement) {
      return;
    }

    const editor = editorElement;
    const preview = previewElement;

    let map: ScrollSyncMap | null = null;
    let isDirty = true;
    let animationFrame: number | null = null;
    let measurementTimer: number | null = null;
    let pendingSource: ScrollSide | null = null;
    let expectedScroll: ExpectedScroll | null = null;
    let ownerUntil = 0;
    const previewBody = preview.querySelector<HTMLElement>(
      ".markdown-body",
    );

    function clearScheduledMeasurement() {
      if (measurementTimer !== null) {
        window.clearTimeout(measurementTimer);
        measurementTimer = null;
      }
    }

    function buildMap() {
      measurementTimer = null;

      if (
        epoch !== epochRef.current ||
        !editor.isConnected ||
        !preview.isConnected
      ) {
        return;
      }

      const previewCoordinates = getPreviewAnchorCoordinates(
        preview,
        markdown.length,
      );
      const sampledOffsets = sampleSourceOffsets(
        Array.from(previewCoordinates.keys()),
        maximumScrollSyncAnchors,
      );
      const signature = getMirrorSignature(
        editor,
        sampledOffsets,
      );
      let editorCoordinates = sourceCoordinateCacheRef.current?.positions;

      if (
        sourceCoordinateCacheRef.current?.markdown !== markdown ||
        sourceCoordinateCacheRef.current?.signature !== signature
      ) {
        editorCoordinates = measureEditorCoordinates(
          editor,
          markdown,
          sampledOffsets,
        );
        sourceCoordinateCacheRef.current = {
          markdown,
          signature,
          positions: editorCoordinates,
        };
      }

      const points: ScrollSyncPoint[] = sampledOffsets.flatMap(
        (sourceOffset) => {
          const editorY = editorCoordinates?.get(sourceOffset);
          const previewY = previewCoordinates.get(sourceOffset);

          return editorY === undefined || previewY === undefined
            ? []
            : [{ sourceOffset, editorY, previewY }];
        },
      );

      map = createScrollSyncMap(
        points,
        markdown.length,
        maximumScrollTop(editor),
        maximumScrollTop(preview),
      );
      isDirty = false;

      if (pendingSource && animationFrame === null) {
        animationFrame = window.requestAnimationFrame(applyPendingScroll);
      }
    }

    function scheduleMeasurement(delay = quietMeasurementDelay) {
      isDirty = true;
      map = null;
      clearScheduledMeasurement();
      measurementTimer = window.setTimeout(buildMap, delay);
    }

    function markLayoutDirty(sourceCoordinatesChanged: boolean) {
      if (sourceCoordinatesChanged) {
        sourceCoordinateCacheRef.current = null;
      }

      isDirty = true;
      map = null;
      clearScheduledMeasurement();

      if (enabledRef.current) {
        scheduleMeasurement();
      }
    }

    function applyPendingScroll() {
      animationFrame = null;
      const source = pendingSource;

      if (!source || epoch !== epochRef.current) {
        return;
      }

      if (isDirty || !map) {
        return;
      }

      pendingSource = null;

      const sourceElement =
        source === "editor" ? editor : preview;
      const targetElement =
        source === "editor" ? preview : editor;
      const target = mapScrollPosition(map, source, sourceElement.scrollTop);

      if (Math.abs(targetElement.scrollTop - target) <= 0.5) {
        return;
      }

      expectedScroll = {
        element: targetElement,
        target,
        epoch,
        expiresAt: performance.now() + userOwnershipDuration,
      };
      targetElement.scrollTo({ top: target, behavior: "auto" });
    }

    function scheduleScroll(source: ScrollSide) {
      pendingSource = source;

      if (animationFrame === null) {
        animationFrame = window.requestAnimationFrame(applyPendingScroll);
      }
    }

    function handleScroll(source: ScrollSide, element: HTMLElement) {
      const now = performance.now();

      if (!enabledRef.current) {
        return;
      }

      if (now < suppressionUntilRef.current) {
        return;
      }

      if (
        expectedScroll?.epoch === epoch &&
        expectedScroll.element === element &&
        now <= expectedScroll.expiresAt &&
        Math.abs(element.scrollTop - expectedScroll.target) <=
          expectedTargetTolerance
      ) {
        expectedScroll = null;
        return;
      }

      scheduleScroll(source);
    }

    function takeOwnership(source: ScrollSide) {
      if (!enabledRef.current) {
        return;
      }

      suppressionUntilRef.current = 0;
      ownerUntil = performance.now() + userOwnershipDuration;
      expectedScroll = null;
      const oppositeElement =
        source === "editor" ? preview : editor;
      const currentTop = oppositeElement.scrollTop;

      expectedScroll = {
        element: oppositeElement,
        target: currentTop,
        epoch,
        expiresAt: ownerUntil,
      };
      oppositeElement.scrollTo({ top: currentTop, behavior: "auto" });
    }

    const handleEditorScroll = () => handleScroll("editor", editor);
    const handlePreviewScroll = () => handleScroll("preview", preview);
    const handleEditorIntent = () => takeOwnership("editor");
    const handlePreviewIntent = () => takeOwnership("preview");
    const handleEditorPointerMove = (event: globalThis.PointerEvent) => {
      if (event.isPrimary && event.buttons === 1) {
        takeOwnership("editor");
      }
    };
    const handlePreviewPointerMove = (event: globalThis.PointerEvent) => {
      if (event.isPrimary && event.buttons === 1) {
        takeOwnership("preview");
      }
    };
    const handleEditorKeyDown = (event: globalThis.KeyboardEvent) => {
      if (isScrollOwnershipKey(event)) {
        takeOwnership("editor");
      }
    };
    const handlePreviewKeyDown = (event: globalThis.KeyboardEvent) => {
      if (isScrollOwnershipKey(event)) {
        takeOwnership("preview");
      }
    };

    editor.addEventListener("scroll", handleEditorScroll, {
      passive: true,
    });
    preview.addEventListener("scroll", handlePreviewScroll, {
      passive: true,
    });
    editor.addEventListener("wheel", handleEditorIntent, {
      passive: true,
    });
    preview.addEventListener("wheel", handlePreviewIntent, {
      passive: true,
    });
    editor.addEventListener("pointermove", handleEditorPointerMove, {
      passive: true,
    });
    preview.addEventListener("pointermove", handlePreviewPointerMove, {
      passive: true,
    });
    editor.addEventListener("touchmove", handleEditorIntent, {
      passive: true,
    });
    preview.addEventListener("touchmove", handlePreviewIntent, {
      passive: true,
    });
    editor.addEventListener("keydown", handleEditorKeyDown);
    preview.addEventListener("keydown", handlePreviewKeyDown);

    const editorResizeObserver = new ResizeObserver(() =>
      markLayoutDirty(true),
    );
    const previewResizeObserver = new ResizeObserver(() =>
      markLayoutDirty(false),
    );
    editorResizeObserver.observe(editor);
    previewResizeObserver.observe(preview);

    if (previewBody) {
      previewResizeObserver.observe(previewBody);
    }

    const previewMutationObserver = new MutationObserver(() =>
      markLayoutDirty(false),
    );

    if (previewBody) {
      previewMutationObserver.observe(previewBody, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ["class", "style", "src"],
      });
    }

    const handlePreviewAssetLoad = (event: Event) => {
      if (event.target instanceof HTMLImageElement) {
        markLayoutDirty(false);
      }
    };
    previewBody?.addEventListener("load", handlePreviewAssetLoad, true);
    previewBody?.addEventListener("error", handlePreviewAssetLoad, true);

    const handleFontLayoutChange = () => markLayoutDirty(true);
    void document.fonts.ready.then(() => {
      if (epoch === epochRef.current) {
        handleFontLayoutChange();
      }
    });
    document.fonts.addEventListener("loadingdone", handleFontLayoutChange);

    controlsRef.current = {
      enable: () => scheduleMeasurement(0),
      disable: () => {
        clearScheduledMeasurement();

        if (animationFrame !== null) {
          window.cancelAnimationFrame(animationFrame);
          animationFrame = null;
        }

        isDirty = true;
        map = null;
        pendingSource = null;
        expectedScroll = null;
      },
    };

    if (enabledRef.current) {
      scheduleMeasurement(0);
    }

    return () => {
      epochRef.current += 1;
      controlsRef.current = null;
      clearScheduledMeasurement();

      if (animationFrame !== null) {
        window.cancelAnimationFrame(animationFrame);
      }

      editorResizeObserver.disconnect();
      previewResizeObserver.disconnect();
      previewMutationObserver.disconnect();
      document.fonts.removeEventListener("loadingdone", handleFontLayoutChange);
      previewBody?.removeEventListener("load", handlePreviewAssetLoad, true);
      previewBody?.removeEventListener("error", handlePreviewAssetLoad, true);
      editor.removeEventListener("scroll", handleEditorScroll);
      preview.removeEventListener("scroll", handlePreviewScroll);
      editor.removeEventListener("wheel", handleEditorIntent);
      preview.removeEventListener("wheel", handlePreviewIntent);
      editor.removeEventListener("pointermove", handleEditorPointerMove);
      preview.removeEventListener("pointermove", handlePreviewPointerMove);
      editor.removeEventListener("touchmove", handleEditorIntent);
      preview.removeEventListener("touchmove", handlePreviewIntent);
      editor.removeEventListener("keydown", handleEditorKeyDown);
      preview.removeEventListener("keydown", handlePreviewKeyDown);
    };
  }, [active, editorElement, markdown, previewElement]);

  useLayoutEffect(() => {
    if (enabled) {
      controlsRef.current?.enable();
    } else {
      controlsRef.current?.disable();
    }
  }, [enabled]);

  return { suppressScrollSyncRestore };
}
