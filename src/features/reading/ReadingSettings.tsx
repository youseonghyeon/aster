import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import {
  lineSpacings,
  mermaidCurveOptions,
  readingFonts,
  themes,
  type LineSpacing,
  type MermaidCurvePreference,
  type ReadingFont,
  type Theme,
} from "./reading-preferences";

type ReadingSettingsProps = {
  theme: Theme;
  readingFont: ReadingFont;
  lineSpacing: LineSpacing;
  mermaidCurve: MermaidCurvePreference;
  onThemeChange: (theme: Theme) => void;
  onReadingFontChange: (font: ReadingFont) => void;
  onLineSpacingChange: (spacing: LineSpacing) => void;
  onMermaidCurveChange: (curve: MermaidCurvePreference) => void;
};

function LineSpacingGlyph() {
  return (
    <span className="line-spacing-glyph" aria-hidden="true">
      <span />
      <span />
      <span />
    </span>
  );
}

function MermaidCurveGlyph({
  curve,
}: {
  curve: MermaidCurvePreference;
}) {
  const path =
    curve === "curved"
      ? "M2 15 C12 15 12 5 21 5 S30 15 40 5"
      : curve === "straight"
        ? "M2 15 L40 5"
        : "M2 15 H21 V5 H40";

  return (
    <svg viewBox="0 0 42 20" aria-hidden="true">
      <path d={path} />
    </svg>
  );
}

function SelectChevronIcon() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true">
      <path d="m4.5 6.25 3.5 3.5 3.5-3.5" />
    </svg>
  );
}

function SelectedOptionIcon() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true">
      <path d="m3.5 8.25 2.75 2.75 6.25-6.25" />
    </svg>
  );
}

function ReadingFontSelect({
  value,
  onChange,
}: {
  value: ReadingFont;
  onChange: (font: ReadingFont) => void;
}) {
  const selectedIndex = readingFonts.findIndex((font) => font.value === value);
  const selectedFont = readingFonts[selectedIndex] ?? readingFonts[0];
  const [isOpen, setIsOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(selectedIndex);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    setActiveIndex(selectedIndex);

    function handleOutsidePointerDown(event: globalThis.PointerEvent) {
      if (
        event.target instanceof Node &&
        !rootRef.current?.contains(event.target)
      ) {
        setIsOpen(false);
      }
    }

    document.addEventListener("pointerdown", handleOutsidePointerDown);
    return () =>
      document.removeEventListener("pointerdown", handleOutsidePointerDown);
  }, [isOpen, selectedIndex]);

  function openMenu() {
    setActiveIndex(selectedIndex);
    setIsOpen(true);
  }

  function selectFont(nextFont: ReadingFont) {
    onChange(nextFont);
    setIsOpen(false);
    window.requestAnimationFrame(() => triggerRef.current?.focus());
  }

  function handleTriggerKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    if (event.key === "Escape" && isOpen) {
      event.preventDefault();
      event.stopPropagation();
      setIsOpen(false);
      return;
    }

    if (event.key === "Tab" && isOpen) {
      setIsOpen(false);
      return;
    }

    if (event.key === "Enter" || event.key === " ") {
      if (!isOpen) {
        return;
      }

      event.preventDefault();
      selectFont(readingFonts[activeIndex].value);
      return;
    }

    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();

      if (!isOpen) {
        openMenu();
        return;
      }

      const direction = event.key === "ArrowDown" ? 1 : -1;
      setActiveIndex(
        (currentIndex) =>
          (currentIndex + direction + readingFonts.length) %
          readingFonts.length,
      );
      return;
    }

    if (isOpen && (event.key === "Home" || event.key === "End")) {
      event.preventDefault();
      setActiveIndex(event.key === "Home" ? 0 : readingFonts.length - 1);
    }
  }

  return (
    <div ref={rootRef} className="font-select">
      <button
        ref={triggerRef}
        type="button"
        className="font-select-trigger"
        aria-label="글꼴"
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-controls="reading-font-options"
        aria-activedescendant={
          isOpen
            ? `reading-font-option-${readingFonts[activeIndex].value}`
            : undefined
        }
        onClick={() => (isOpen ? setIsOpen(false) : openMenu())}
        onKeyDown={handleTriggerKeyDown}
      >
        <span>{selectedFont.label}</span>
        <SelectChevronIcon />
      </button>

      {isOpen ? (
        <div
          id="reading-font-options"
          className="font-select-options"
          role="listbox"
          aria-label="글꼴 선택"
        >
          {readingFonts.map((fontOption, index) => (
            <button
              id={`reading-font-option-${fontOption.value}`}
              key={fontOption.value}
              type="button"
              role="option"
              tabIndex={-1}
              className="font-select-option"
              data-font-option={fontOption.value}
              aria-selected={value === fontOption.value}
              data-active={activeIndex === index ? "true" : undefined}
              onPointerEnter={() => setActiveIndex(index)}
              onClick={() => selectFont(fontOption.value)}
            >
              <span>{fontOption.label}</span>
              {value === fontOption.value ? <SelectedOptionIcon /> : null}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function ReadingSettings({
  theme,
  readingFont,
  lineSpacing,
  mermaidCurve,
  onThemeChange,
  onReadingFontChange,
  onLineSpacingChange,
  onMermaidCurveChange,
}: ReadingSettingsProps) {
  return (
    <div
      id="reading-settings-popover"
      className="settings-popover"
      role="dialog"
      aria-labelledby="reading-settings-title"
    >
      <div className="settings-popover-header">
        <h2 id="reading-settings-title">읽기 설정</h2>
        <span>미리보기 모양</span>
      </div>

      <div className="settings-group">
        <span id="theme-setting-label" className="settings-label">
          테마
        </span>
        <div className="theme-options" role="group" aria-labelledby="theme-setting-label">
          {themes.map((themeOption) => (
            <button
              key={themeOption.value}
              type="button"
              className="theme-option"
              data-theme-option={themeOption.value}
              aria-label={themeOption.label}
              aria-pressed={theme === themeOption.value}
              title={themeOption.label}
              onClick={() => onThemeChange(themeOption.value)}
            >
              <span className="theme-swatch" aria-hidden="true" />
            </button>
          ))}
        </div>
      </div>

      <div className="settings-group">
        <span className="settings-label">글꼴</span>
        <ReadingFontSelect value={readingFont} onChange={onReadingFontChange} />
      </div>

      <div className="settings-group">
        <span id="line-spacing-setting-label" className="settings-label">
          행간
        </span>
        <div
          className="line-spacing-options"
          role="group"
          aria-labelledby="line-spacing-setting-label"
        >
          {lineSpacings.map((spacingOption) => (
            <button
              key={spacingOption.value}
              type="button"
              className="line-spacing-option"
              data-spacing={spacingOption.value}
              aria-label={spacingOption.label}
              aria-pressed={lineSpacing === spacingOption.value}
              title={spacingOption.label}
              onClick={() => onLineSpacingChange(spacingOption.value)}
            >
              <LineSpacingGlyph />
            </button>
          ))}
        </div>
      </div>

      <div className="settings-group">
        <span id="mermaid-curve-setting-label" className="settings-label">
          다이어그램 선
        </span>
        <div
          className="mermaid-curve-options"
          role="group"
          aria-labelledby="mermaid-curve-setting-label"
        >
          {mermaidCurveOptions.map((curveOption) => (
            <button
              key={curveOption.value}
              type="button"
              className="mermaid-curve-option"
              data-curve={curveOption.value}
              aria-label={curveOption.label}
              aria-pressed={mermaidCurve === curveOption.value}
              title={curveOption.label}
              onClick={() => onMermaidCurveChange(curveOption.value)}
            >
              <MermaidCurveGlyph curve={curveOption.value} />
              <span aria-hidden="true">{curveOption.label}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
