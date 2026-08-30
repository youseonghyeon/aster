export const lastOpenedDocumentStorageKey = "aster:last-opened-document:v1";

export function loadLastOpenedDocumentPath(): string | null {
  try {
    const path = localStorage.getItem(lastOpenedDocumentStorageKey)?.trim();
    return path || null;
  } catch {
    return null;
  }
}

export function loadInitialDocumentPath(
  fallbackPath: string | null,
): string | null {
  try {
    const storedPath = localStorage.getItem(lastOpenedDocumentStorageKey);
    if (storedPath === null) return fallbackPath;
    return storedPath.trim() || null;
  } catch {
    return fallbackPath;
  }
}

export function saveLastOpenedDocumentPath(path: string): boolean {
  const normalizedPath = path.trim();
  if (!normalizedPath) return false;

  try {
    localStorage.setItem(lastOpenedDocumentStorageKey, normalizedPath);
    return true;
  } catch {
    return false;
  }
}

export function clearLastOpenedDocumentPath(): boolean {
  try {
    localStorage.setItem(lastOpenedDocumentStorageKey, "");
    return true;
  } catch {
    return false;
  }
}
