export type MarkdownLinkTarget =
  | { kind: "anchor"; anchor: string | null }
  | { kind: "markdown"; path: string; anchor: string | null }
  | { kind: "external"; url: string }
  | { kind: "unsupported"; reason: string };

const markdownExtensionPattern = /\.(?:md|markdown)$/i;
const urlSchemePattern = /^([a-z][a-z\d+.-]*):/i;

function decodeUrlPart(value: string, label: string) {
  try {
    return { value: decodeURIComponent(value), error: null };
  } catch {
    return {
      value: "",
      error: `${label}의 URL encoding을 해석할 수 없습니다.`,
    };
  }
}

export function classifyMarkdownLink(href: string): MarkdownLinkTarget {
  const value = href.trim();
  if (!value) return { kind: "anchor", anchor: null };

  if (value.startsWith("#")) {
    const decoded = decodeUrlPart(value.slice(1), "제목 링크");
    return decoded.error
      ? { kind: "unsupported", reason: decoded.error }
      : { kind: "anchor", anchor: decoded.value || null };
  }

  if (value.startsWith("//")) {
    try {
      return { kind: "external", url: new URL(`https:${value}`).toString() };
    } catch {
      return { kind: "unsupported", reason: "웹 링크 주소가 올바르지 않습니다." };
    }
  }

  const scheme = urlSchemePattern.exec(value)?.[1]?.toLowerCase();
  if (scheme) {
    if (scheme !== "http" && scheme !== "https") {
      return {
        kind: "unsupported",
        reason: `“${scheme}:” 링크는 Aster에서 열 수 없습니다.`,
      };
    }
    try {
      return { kind: "external", url: new URL(value).toString() };
    } catch {
      return { kind: "unsupported", reason: "웹 링크 주소가 올바르지 않습니다." };
    }
  }

  const hashIndex = value.indexOf("#");
  const pathAndQuery = hashIndex >= 0 ? value.slice(0, hashIndex) : value;
  const fragment = hashIndex >= 0 ? value.slice(hashIndex + 1) : "";
  const queryIndex = pathAndQuery.indexOf("?");
  const encodedPath = queryIndex >= 0 ? pathAndQuery.slice(0, queryIndex) : pathAndQuery;
  const decodedPath = decodeUrlPart(encodedPath, "문서 경로");
  const decodedFragment = decodeUrlPart(fragment, "제목 링크");
  const decodeError = decodedPath.error ?? decodedFragment.error;

  if (decodeError) return { kind: "unsupported", reason: decodeError };
  if (!decodedPath.value) {
    return { kind: "anchor", anchor: decodedFragment.value || null };
  }
  if (
    decodedPath.value.startsWith("/") ||
    decodedPath.value.startsWith("\\") ||
    /^[a-z]:[\\/]/i.test(decodedPath.value)
  ) {
    return {
      kind: "unsupported",
      reason: "절대 파일 경로 링크는 Aster에서 열 수 없습니다.",
    };
  }
  if (!markdownExtensionPattern.test(decodedPath.value)) {
    return {
      kind: "unsupported",
      reason: "상대 링크는 Markdown 파일(.md 또는 .markdown)만 열 수 있습니다.",
    };
  }

  return {
    kind: "markdown",
    path: decodedPath.value,
    anchor: decodedFragment.value || null,
  };
}

export function isRelativeAssetSource(src: string) {
  const value = src.trim();
  return Boolean(
    value &&
      !value.startsWith("#") &&
      !value.startsWith("/") &&
      !value.startsWith("\\") &&
      !value.startsWith("//") &&
      !urlSchemePattern.test(value),
  );
}

export function decodeRelativeAssetPath(src: string) {
  if (!isRelativeAssetSource(src)) return null;
  const path = src.split(/[?#]/, 1)[0] ?? "";
  try {
    return decodeURIComponent(path);
  } catch {
    throw new Error("이미지 경로의 URL encoding을 해석할 수 없습니다.");
  }
}
