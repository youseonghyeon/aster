import {
  mermaidCurvePreferences,
  type MermaidCurvePreference,
} from "../../lib/mermaid-curve";

export const themes = [
  { value: "snow", label: "밝게" },
  { value: "paper", label: "종이" },
  { value: "solarized", label: "Solarized" },
  { value: "sepia", label: "세피아" },
  { value: "nord", label: "Nord" },
  { value: "dracula", label: "Dracula" },
  { value: "gruvbox", label: "Gruvbox" },
  { value: "night", label: "야간" },
] as const;

export const readingFonts = [
  { value: "pretendard", label: "Pretendard" },
  { value: "noto-sans", label: "Noto Sans KR" },
  { value: "gowun-batang", label: "고운바탕" },
  { value: "noto-serif", label: "Noto Serif KR" },
  { value: "system", label: "시스템 고딕" },
  { value: "literata", label: "Literata" },
  { value: "eb-garamond", label: "EB Garamond" },
  { value: "dancing-script", label: "Dancing Script" },
] as const;

export const lineSpacings = [
  { value: "tight", label: "매우 촘촘 1.4" },
  { value: "compact", label: "촘촘 1.5" },
  { value: "balanced", label: "기본 1.7" },
  { value: "relaxed", label: "여유 1.9" },
] as const;

export const readingFontSizes = [
  { value: "15", label: "작게 15px" },
  { value: "17", label: "기본 17px" },
  { value: "19", label: "크게 19px" },
  { value: "21", label: "아주 크게 21px" },
] as const;

export const mermaidCurveOptions = [
  { value: mermaidCurvePreferences[0], label: "곡선" },
  { value: mermaidCurvePreferences[1], label: "직선" },
  { value: mermaidCurvePreferences[2], label: "직각" },
] as const satisfies readonly {
  value: MermaidCurvePreference;
  label: string;
}[];

export const readingZoomLevels = [
  { value: "80" },
  { value: "90" },
  { value: "100" },
  { value: "110" },
  { value: "120" },
  { value: "130" },
  { value: "140" },
  { value: "150" },
] as const;

export const scrollSyncOptions = [{ value: "off" }, { value: "on" }] as const;

export const readingPreferenceStorageKeys = {
  theme: "aster:theme:v1",
  font: "aster:reading-font:v1",
  fontSize: "aster:reading-font-size:v1",
  lineSpacing: "aster:line-spacing:v1",
  mermaidCurve: "aster:mermaid-curve:v1",
  zoom: "aster:reading-zoom:v1",
  scrollSync: "aster:scroll-sync:v1",
} as const;

export type Theme = (typeof themes)[number]["value"];
export type ReadingFont = (typeof readingFonts)[number]["value"];
export type ReadingFontSize = (typeof readingFontSizes)[number]["value"];
export type LineSpacing = (typeof lineSpacings)[number]["value"];
export type { MermaidCurvePreference } from "../../lib/mermaid-curve";
export type ReadingZoom = (typeof readingZoomLevels)[number]["value"];
export type ScrollSyncPreference =
  (typeof scrollSyncOptions)[number]["value"];
export type ReadingZoomCommand = "in" | "out" | "reset";

export function loadReadingPreference<T extends string>(
  storageKey: string,
  options: readonly { value: T }[],
  fallback: T,
): T {
  try {
    const storedValue = localStorage.getItem(storageKey);
    const isKnownValue = options.some((option) => option.value === storedValue);
    return isKnownValue ? (storedValue as T) : fallback;
  } catch {
    return fallback;
  }
}

export function saveReadingPreference(storageKey: string, value: string) {
  try {
    localStorage.setItem(storageKey, value);
  } catch {
    // The setting still applies for this session when storage is unavailable.
  }
}

export function getSteppedReadingZoom(
  currentZoom: ReadingZoom,
  direction: -1 | 1,
): ReadingZoom {
  const currentIndex = readingZoomLevels.findIndex(
    (option) => option.value === currentZoom,
  );
  const nextIndex = Math.min(
    readingZoomLevels.length - 1,
    Math.max(0, currentIndex + direction),
  );
  return readingZoomLevels[nextIndex].value;
}
