export type RecentDocument = {
  path: string;
  name: string;
};

export const recentDocumentsStorageKey = "aster:recent-documents:v1";
export const maximumRecentDocumentCount = 10;

function isRecentDocument(value: unknown): value is RecentDocument {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Partial<RecentDocument>;
  return (
    typeof candidate.path === "string" &&
    candidate.path.trim().length > 0 &&
    typeof candidate.name === "string" &&
    candidate.name.trim().length > 0
  );
}

export function normalizeRecentDocuments(value: unknown): RecentDocument[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const paths = new Set<string>();
  const documents: RecentDocument[] = [];

  for (const item of value) {
    if (!isRecentDocument(item) || paths.has(item.path)) {
      continue;
    }

    paths.add(item.path);
    documents.push({ path: item.path, name: item.name });

    if (documents.length === maximumRecentDocumentCount) {
      break;
    }
  }

  return documents;
}

export function parseRecentDocuments(
  serializedDocuments: string | null,
): RecentDocument[] {
  if (!serializedDocuments) {
    return [];
  }

  try {
    return normalizeRecentDocuments(JSON.parse(serializedDocuments));
  } catch {
    return [];
  }
}

export function loadRecentDocuments(): RecentDocument[] {
  try {
    return parseRecentDocuments(localStorage.getItem(recentDocumentsStorageKey));
  } catch {
    return [];
  }
}

export function promoteRecentDocument(
  documents: RecentDocument[],
  document: RecentDocument,
  aliases: readonly string[] = [],
): RecentDocument[] {
  const replacedPaths = new Set([document.path, ...aliases]);
  return normalizeRecentDocuments([
    document,
    ...documents.filter((item) => !replacedPaths.has(item.path)),
  ]);
}

export function saveRecentDocuments(documents: RecentDocument[]): boolean {
  try {
    localStorage.setItem(
      recentDocumentsStorageKey,
      JSON.stringify(normalizeRecentDocuments(documents)),
    );
    return true;
  } catch {
    return false;
  }
}
