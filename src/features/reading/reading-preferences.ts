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
  { value: "noto-serif", label: "Noto Serif KR" },
  { value: "system", label: "시스템 고딕" },
] as const;

export const lineSpacings = [
  { value: "tight", label: "매우 촘촘 1.4" },
  { value: "compact", label: "촘촘 1.5" },
  { value: "balanced", label: "기본 1.7" },
  { value: "relaxed", label: "여유 1.9" },
] as const;

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
  lineSpacing: "aster:line-spacing:v1",
  zoom: "aster:reading-zoom:v1",
  scrollSync: "aster:scroll-sync:v1",
} as const;

export type Theme = (typeof themes)[number]["value"];
export type ReadingFont = (typeof readingFonts)[number]["value"];
export type LineSpacing = (typeof lineSpacings)[number]["value"];
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
