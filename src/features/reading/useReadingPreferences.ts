import { listen } from "@tauri-apps/api/event";
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

const isNoBlockingModalOpen = () => false;

export function useReadingPreferences({
  isBlockingModalOpen = isNoBlockingModalOpen,
}: {
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
    setTheme(nextTheme);
    saveReadingPreference(readingPreferenceStorageKeys.theme, nextTheme);
  }, []);
  const selectReadingFont = useCallback((nextFont: ReadingFont) => {
    setReadingFont(nextFont);
    saveReadingPreference(readingPreferenceStorageKeys.font, nextFont);
  }, []);
  const selectReadingFontSize = useCallback((nextSize: ReadingFontSize) => {
    setReadingFontSize(nextSize);
    saveReadingPreference(readingPreferenceStorageKeys.fontSize, nextSize);
  }, []);
  const selectLineSpacing = useCallback((nextSpacing: LineSpacing) => {
    setLineSpacing(nextSpacing);
    saveReadingPreference(
      readingPreferenceStorageKeys.lineSpacing,
      nextSpacing,
    );
  }, []);
  const selectMermaidCurve = useCallback(
    (nextCurve: MermaidCurvePreference) => {
      setMermaidCurve(nextCurve);
      saveReadingPreference(
        readingPreferenceStorageKeys.mermaidCurve,
        nextCurve,
      );
    },
    [],
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
  }, [isBlockingModalOpen]);

  const readingStyle = useMemo(() => {
    const zoomPercent = Number(readingZoom);
    return {
      "--reading-font-size": `${(Number(readingFontSize) * zoomPercent) / 100}px`,
      "--reading-content-width": `${(800 * zoomPercent) / 100}px`,
      "--reading-padding-top": `${(42 * zoomPercent) / 100}px`,
      "--reading-padding-bottom": `${(100 * zoomPercent) / 100}px`,
    } as CSSProperties;
  }, [readingFontSize, readingZoom]);

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
