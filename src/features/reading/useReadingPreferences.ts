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
  mermaidCurveOptions,
  readingPreferenceStorageKeys,
  readingZoomLevels,
  saveReadingPreference,
  scrollSyncOptions,
  themes,
  type LineSpacing,
  type MermaidCurvePreference,
  type ReadingFont,
  type ReadingZoom,
  type ReadingZoomCommand,
  type ScrollSyncPreference,
  type Theme,
} from "./reading-preferences";

export function useReadingPreferences() {
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
  }, []);

  const readingZoomStyle = useMemo(
    () =>
      ({
        "--reading-font-size": `${(17 * Number(readingZoom)) / 100}px`,
      }) as CSSProperties,
    [readingZoom],
  );

  return {
    theme,
    readingFont,
    lineSpacing,
    mermaidCurve,
    readingZoom,
    readingZoomStyle,
    isScrollSyncEnabled: scrollSyncPreference === "on",
    selectTheme,
    selectReadingFont,
    selectLineSpacing,
    selectMermaidCurve,
    toggleScrollSync,
  };
}
