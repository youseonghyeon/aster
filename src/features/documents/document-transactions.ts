import { initialMarkdown } from "./initial-document";
import type { DocumentSnapshot } from "./document-session-state";
import { hasUnsavedMarkdown } from "./document-session";

export function isDocumentDirty(document: DocumentSnapshot): boolean {
  return hasUnsavedMarkdown(
    document.markdown,
    document.loadedMarkdown,
    initialMarkdown,
  );
}

export function isSameDocumentContext(
  current: DocumentSnapshot,
  expected: DocumentSnapshot,
  includeEditVersion = false,
): boolean {
  return (
    current.generation === expected.generation &&
    current.path === expected.path &&
    (!includeEditVersion || current.editVersion === expected.editVersion)
  );
}
