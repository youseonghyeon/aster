export const untitledDocumentNoteStorageKey =
  "aster:document-note:untitled:v1";

export type DocumentContext = {
  generation: number;
  path: string | null;
  markdownEditVersion?: number;
};

export function getDocumentNoteStorageKey(filePath: string | null): string {
  return filePath
    ? `aster:document-note:file:v1:${filePath}`
    : untitledDocumentNoteStorageKey;
}

export function loadDocumentNote(storageKey: string): string {
  try {
    return localStorage.getItem(storageKey) ?? "";
  } catch {
    return "";
  }
}

export function saveDocumentNote(
  storageKey: string,
  value: string,
): boolean {
  try {
    localStorage.setItem(storageKey, value);
    return true;
  } catch {
    return false;
  }
}

export function hasUnsavedMarkdown(
  markdown: string,
  loadedMarkdown: string | null,
  initialMarkdown: string,
): boolean {
  return markdown !== (loadedMarkdown ?? initialMarkdown);
}

export function isDocumentContextCurrent(
  current: DocumentContext,
  expected: DocumentContext,
): boolean {
  return (
    current.generation === expected.generation &&
    current.path === expected.path &&
    (expected.markdownEditVersion === undefined ||
      current.markdownEditVersion === expected.markdownEditVersion)
  );
}
