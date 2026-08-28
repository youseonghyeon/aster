import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  loadRecentDocuments,
  maximumRecentDocumentCount,
  normalizeRecentDocuments,
  promoteRecentDocument,
  recentDocumentsStorageKey,
  saveRecentDocuments,
} from "./recent-documents";

describe("recent documents", () => {
  beforeEach(() => localStorage.clear());

  it("drops invalid and duplicate entries and applies the size limit", () => {
    const input = Array.from(
      { length: maximumRecentDocumentCount + 2 },
      (_, index) => ({ path: `/doc-${index}.md`, name: `doc-${index}.md` }),
    );
    input.splice(1, 0, input[0]);

    expect(normalizeRecentDocuments([null, ...input])).toEqual(
      input.filter((_document, index) => index !== 1).slice(0, 10),
    );
  });

  it("promotes a document while removing aliases", () => {
    expect(
      promoteRecentDocument(
        [
          { path: "/old.md", name: "old.md" },
          { path: "/other.md", name: "other.md" },
        ],
        { path: "/canonical.md", name: "canonical.md" },
        ["/old.md"],
      ),
    ).toEqual([
      { path: "/canonical.md", name: "canonical.md" },
      { path: "/other.md", name: "other.md" },
    ]);
  });

  it("round-trips storage and survives unavailable storage", () => {
    const documents = [{ path: "/doc.md", name: "doc.md" }];
    expect(saveRecentDocuments(documents)).toBe(true);
    expect(loadRecentDocuments()).toEqual(documents);

    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("quota");
    });
    expect(saveRecentDocuments(documents)).toBe(false);
    expect(localStorage.getItem(recentDocumentsStorageKey)).not.toBeNull();
  });
});
