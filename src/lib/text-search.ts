export type TextSearchOptions = {
  isCaseSensitive: boolean;
  isRegex: boolean;
};

export type TextSearchMatch = {
  start: number;
  end: number;
};

export type TextSearchResult = {
  matches: TextSearchMatch[];
  error: string | null;
  isTruncated: boolean;
};

export type SearchArea = "editor" | "notes" | "preview";

export type SearchSession = TextSearchOptions & {
  isOpen: boolean;
  query: string;
  currentIndex: number;
};

export const emptySearchSession: SearchSession = {
  isOpen: false,
  query: "",
  currentIndex: 0,
  isCaseSensitive: false,
  isRegex: false,
};

const maximumStoredMatches = 10_000;
const regularExpressionCharacters = /[.*+?^${}()|[\]\\]/g;

function escapeRegularExpression(value: string): string {
  return value.replace(regularExpressionCharacters, "\\$&");
}

function advanceStringIndex(value: string, index: number): number {
  const firstCodeUnit = value.charCodeAt(index);

  if (
    firstCodeUnit >= 0xd800 &&
    firstCodeUnit <= 0xdbff &&
    index + 1 < value.length
  ) {
    const secondCodeUnit = value.charCodeAt(index + 1);

    if (secondCodeUnit >= 0xdc00 && secondCodeUnit <= 0xdfff) {
      return index + 2;
    }
  }

  return index + 1;
}

export function findTextMatches(
  value: string,
  query: string,
  options: TextSearchOptions,
): TextSearchResult {
  if (query.length === 0) {
    return { matches: [], error: null, isTruncated: false };
  }

  let expression: RegExp;

  try {
    expression = new RegExp(
      options.isRegex ? query : escapeRegularExpression(query),
      options.isCaseSensitive ? "gu" : "giu",
    );
  } catch {
    return {
      matches: [],
      error: "정규식 문법 오류 · 괄호와 대괄호를 닫아주세요",
      isTruncated: false,
    };
  }

  const matches: TextSearchMatch[] = [];
  let match = expression.exec(value);

  while (match) {
    matches.push({
      start: match.index,
      end: match.index + match[0].length,
    });

    if (match[0].length === 0) {
      expression.lastIndex = advanceStringIndex(value, expression.lastIndex);
    }

    if (matches.length === maximumStoredMatches) {
      return {
        matches,
        error: null,
        isTruncated: expression.exec(value) !== null,
      };
    }

    match = expression.exec(value);
  }

  return { matches, error: null, isTruncated: false };
}

export function normalizeSearchIndex(index: number, matchCount: number): number {
  if (matchCount === 0) {
    return 0;
  }

  return ((index % matchCount) + matchCount) % matchCount;
}
