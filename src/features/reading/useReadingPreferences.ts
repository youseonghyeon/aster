import { listen } from "@tauri-apps/api/event";
import type { AppEventChannel } from "../../shared/app-events";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type CSSProperties,
} from "react";
import {
  getSteppedReadingZoom,
  lineSpacings,
  loadReadingPreference,
  readingFonts,
  readingFontSizes,
  mermaidCurveOptions,
  readingPreferenceStorageKeys,
  readingZoomLevels,
  saveReadingPreference,
  scrollSyncOptions,
  themes,
  type LineSpacing,
  type MermaidCurvePreference,
  type ReadingFont,
  type ReadingFontSize,
  type ReadingZoom,
  type ReadingZoomCommand,
  type ScrollSyncPreference,
  type Theme,
} from "./reading-preferences";
import { getReadingTypographyCompensation } from "./reading-typography";

const isNoBlockingModalOpen = () => false;

export function useReadingPreferences({
  events,
  isBlockingModalOpen = isNoBlockingModalOpen,
}: {
  events?: AppEventChannel;
  isBlockingModalOpen?: () => boolean;
} = {}) {
  const [theme, setTheme] = useState<Theme>(() =>
    loadReadingPreference(readingPreferenceStorageKeys.theme, themes, "paper"),
  );
  const [readingFont, setReadingFont] = useState<ReadingFont>(() =>
    loadReadingPreference(
      readingPreferenceStorageKeys.font,
      readingFonts,
      "pretendard",
    ),
  );
  const [readingFontSize, setReadingFontSize] = useState<ReadingFontSize>(() =>
    loadReadingPreference(
      readingPreferenceStorageKeys.fontSize,
      readingFontSizes,
      "17",
    ),
  );
  const [lineSpacing, setLineSpacing] = useState<LineSpacing>(() =>
    loadReadingPreference(
      readingPreferenceStorageKeys.lineSpacing,
      lineSpacings,
      "balanced",
    ),
  );
  const [mermaidCurve, setMermaidCurve] = useState<MermaidCurvePreference>(() =>
    loadReadingPreference(
      readingPreferenceStorageKeys.mermaidCurve,
      mermaidCurveOptions,
      "curved",
    ),
  );
  const [readingZoom, setReadingZoom] = useState<ReadingZoom>(() =>
    loadReadingPreference(
      readingPreferenceStorageKeys.zoom,
      readingZoomLevels,
      "100",
    ),
  );
  const [scrollSyncPreference, setScrollSyncPreference] =
    useState<ScrollSyncPreference>(() =>
      loadReadingPreference(
        readingPreferenceStorageKeys.scrollSync,
        scrollSyncOptions,
        "off",
      ),
    );

  const selectTheme = useCallback((nextTheme: Theme) => {
    events?.emit("reading-layout-will-change", undefined);
    setTheme(nextTheme);
    saveReadingPreference(readingPreferenceStorageKeys.theme, nextTheme);
  }, [events]);
  const selectReadingFont = useCallback((nextFont: ReadingFont) => {
    events?.emit("reading-layout-will-change", undefined);
    setReadingFont(nextFont);
    saveReadingPreference(readingPreferenceStorageKeys.font, nextFont);
  }, [events]);
  const selectReadingFontSize = useCallback((nextSize: ReadingFontSize) => {
    events?.emit("reading-layout-will-change", undefined);
    setReadingFontSize(nextSize);
    saveReadingPreference(readingPreferenceStorageKeys.fontSize, nextSize);
  }, [events]);
  const selectLineSpacing = useCallback((nextSpacing: LineSpacing) => {
    events?.emit("reading-layout-will-change", undefined);
    setLineSpacing(nextSpacing);
    saveReadingPreference(
      readingPreferenceStorageKeys.lineSpacing,
      nextSpacing,
    );
  }, [events]);
  const selectMermaidCurve = useCallback(
    (nextCurve: MermaidCurvePreference) => {
      events?.emit("reading-layout-will-change", undefined);
      setMermaidCurve(nextCurve);
      saveReadingPreference(
        readingPreferenceStorageKeys.mermaidCurve,
        nextCurve,
      );
    },
    [events],
  );
  const toggleScrollSync = useCallback(() => {
    setScrollSyncPreference((currentPreference) => {
      const nextPreference = currentPreference === "on" ? "off" : "on";
      saveReadingPreference(
        readingPreferenceStorageKeys.scrollSync,
        nextPreference,
      );
      return nextPreference;
    });
  }, []);

  useEffect(() => {
    let disposed = false;
    let stopListening: (() => void) | undefined;
    void listen<ReadingZoomCommand>("reading-zoom-requested", (event) => {
      if (isBlockingModalOpen()) return;
      events?.emit("reading-layout-will-change", undefined);
      setReadingZoom((currentZoom) => {
        const updatedZoom =
          event.payload === "in"
            ? getSteppedReadingZoom(currentZoom, 1)
            : event.payload === "out"
              ? getSteppedReadingZoom(currentZoom, -1)
              : "100";
        saveReadingPreference(readingPreferenceStorageKeys.zoom, updatedZoom);
        return updatedZoom;
      });
    })
      .then((unlisten) => {
        if (disposed) {
          unlisten();
        } else {
          stopListening = unlisten;
        }
      })
      .catch((error) => {
        if (!disposed) {
          console.error("읽기 확대/축소 이벤트를 연결하지 못했습니다.", error);
        }
      });
    return () => {
      disposed = true;
      stopListening?.();
    };
  }, [events, isBlockingModalOpen]);

  const readingStyle = useMemo(() => {
    const zoomPercent = Number(readingZoom);
    const effectiveFontSize =
      (Number(readingFontSize) * zoomPercent) / 100;
    const typographyCompensation = getReadingTypographyCompensation(
      readingFont,
      effectiveFontSize,
    );
    return {
      "--reading-font-size": `${effectiveFontSize}px`,
      "--reading-font-weight": typographyCompensation.fontWeight,
      "--reading-text-stroke-width": `${typographyCompensation.textStrokeWidth}px`,
      "--reading-content-width": `${(800 * zoomPercent) / 100}px`,
      "--reading-padding-top": `${(42 * zoomPercent) / 100}px`,
      "--reading-padding-bottom": `${(100 * zoomPercent) / 100}px`,
    } as CSSProperties;
  }, [readingFont, readingFontSize, readingZoom]);

  return {
    theme,
    readingFont,
    readingFontSize,
    lineSpacing,
    mermaidCurve,
    readingZoom,
    readingStyle,
    isScrollSyncEnabled: scrollSyncPreference === "on",
    selectTheme,
    selectReadingFont,
    selectReadingFontSize,
    selectLineSpacing,
    selectMermaidCurve,
    toggleScrollSync,
  };
}
