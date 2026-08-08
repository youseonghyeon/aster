import { useEffect, useState, type KeyboardEvent } from "react";
import { normalizeSearchIndex, type SearchSession } from "../lib/text-search";
import "./PaneSearchBar.css";

const numberFormatter = new Intl.NumberFormat("ko-KR");

export function SearchIcon() {
  return (
    <svg viewBox="0 0 18 18" aria-hidden="true">
      <circle cx="7.5" cy="7.5" r="4.5" />
      <path d="m11 11 3.5 3.5" />
    </svg>
  );
}

function PreviousMatchIcon() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true">
      <path d="m4 9 4-4 4 4M8 5v7" />
    </svg>
  );
}

function NextMatchIcon() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true">
      <path d="m4 7 4 4 4-4M8 4v7" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true">
      <path d="m4.5 4.5 7 7m0-7-7 7" />
    </svg>
  );
}

export function PaneSearchBar({
  areaLabel,
  session,
  matchCount,
  error,
  isTruncated,
  onInputElementChange,
  onQueryChange,
  onCaseSensitiveChange,
  onRegexChange,
  onNavigate,
  onClose,
  onActivate,
}: {
  areaLabel: string;
  session: SearchSession;
  matchCount: number;
  error: string | null;
  isTruncated: boolean;
  onInputElementChange: (element: HTMLInputElement | null) => void;
  onQueryChange: (query: string) => void;
  onCaseSensitiveChange: (isCaseSensitive: boolean) => void;
  onRegexChange: (isRegex: boolean) => void;
  onNavigate: (direction: -1 | 1) => void;
  onClose: () => void;
  onActivate: () => void;
}) {
  const [isComposing, setIsComposing] = useState(false);
  const statusId = `${areaLabel}-search-status`;
  const currentResult =
    matchCount === 0
      ? 0
      : normalizeSearchIndex(session.currentIndex, matchCount) + 1;
  const visibleStatus = error
    ? "오류"
    : session.query.length === 0
      ? "—"
      : `${numberFormatter.format(currentResult)} / ${numberFormatter.format(matchCount)}${isTruncated ? "+" : ""}`;
  const announcedStatus = error
    ? error
    : session.query.length === 0
      ? `${areaLabel} 검색어를 입력하세요`
      : matchCount === 0
        ? "검색 결과 없음"
        : `${currentResult}번째 결과, 전체 ${matchCount}${isTruncated ? "개 이상" : "개"}`;

  useEffect(() => {
    const input = document.querySelector<HTMLInputElement>(
      `[data-search-input="${areaLabel}"]`,
    );
    input?.focus({ preventScroll: true });
    input?.select();
  }, [areaLabel]);

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      onClose();
      return;
    }

    if (event.key === "Enter" && !isComposing && !event.nativeEvent.isComposing) {
      event.preventDefault();
      onNavigate(event.shiftKey ? -1 : 1);
    }
  }

  return (
    <div
      className="pane-search-bar"
      role="search"
      aria-label={`${areaLabel} 검색`}
      onFocus={onActivate}
      onPointerDown={onActivate}
    >
      <label className="pane-search-field">
        <span className="visually-hidden">{areaLabel}에서 검색</span>
        <SearchIcon />
        <input
          ref={onInputElementChange}
          data-search-input={areaLabel}
          name={`${areaLabel}-search`}
          type="search"
          value={session.query}
          placeholder="검색…"
          autoComplete="off"
          spellCheck={false}
          aria-invalid={error ? "true" : undefined}
          aria-describedby={statusId}
          onChange={(event) => onQueryChange(event.currentTarget.value)}
          onCompositionStart={() => setIsComposing(true)}
          onCompositionEnd={() => setIsComposing(false)}
          onKeyDown={handleKeyDown}
        />
      </label>

      <span className={`pane-search-count${error ? " is-error" : ""}`} aria-hidden="true">
        {visibleStatus}
      </span>
      <span id={statusId} className="visually-hidden" aria-live="polite">
        {announcedStatus}
      </span>
      {error ? (
        <span className="pane-search-error" aria-hidden="true">
          {error}
        </span>
      ) : null}

      <div className="pane-search-actions">
        <button
          type="button"
          className="pane-search-option"
          aria-label="대소문자 구분"
          aria-pressed={session.isCaseSensitive}
          title="대소문자 구분"
          onClick={() => onCaseSensitiveChange(!session.isCaseSensitive)}
        >
          Aa
        </button>
        <button
          type="button"
          className="pane-search-option is-regex"
          aria-label="정규식 사용"
          aria-pressed={session.isRegex}
          title="정규식 사용"
          onClick={() => onRegexChange(!session.isRegex)}
        >
          .*
        </button>
        <button
          type="button"
          className="pane-search-action"
          aria-label="이전 검색 결과"
          title="이전 검색 결과 (Shift+Enter)"
          disabled={matchCount === 0 || Boolean(error)}
          onClick={() => onNavigate(-1)}
        >
          <PreviousMatchIcon />
        </button>
        <button
          type="button"
          className="pane-search-action"
          aria-label="다음 검색 결과"
          title="다음 검색 결과 (Enter)"
          disabled={matchCount === 0 || Boolean(error)}
          onClick={() => onNavigate(1)}
        >
          <NextMatchIcon />
        </button>
        <button
          type="button"
          className="pane-search-action"
          aria-label={`${areaLabel} 검색 닫기`}
          title="검색 닫기 (Escape)"
          onClick={onClose}
        >
          <CloseIcon />
        </button>
      </div>
    </div>
  );
}
