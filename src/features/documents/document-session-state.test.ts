import { describe, expect, it } from "vitest";
import {
  createDocumentSessionState,
  documentSessionReducer,
} from "./document-session-state";

describe("document session state", () => {
  it("commits a switched document, note, recent list, and generation atomically", () => {
    const openingState = documentSessionReducer(createDocumentSessionState(), {
      type: "operation-started",
      operation: { token: 1, kind: "open" },
    });
    const nextDocument = {
      name: "next.md",
      path: "/docs/next.md",
      markdown: "# 다음",
      loadedMarkdown: "# 다음",
      revision: "next-revision",
      format: { hasBom: false, lineEnding: "lf" as const },
      draftIdentity: "file:/docs/next.md",
      saveStatus: "saved" as const,
      recovered: false,
      generation: 1,
      editVersion: 1,
    };

    const committed = documentSessionReducer(openingState, {
      type: "commit-open",
      document: nextDocument,
      note: "다음 문서 메모",
      recentDocuments: [{ path: "/docs/next.md", name: "next.md" }],
      unavailablePaths: new Set(),
      persistenceLimited: false,
    });

    expect(committed).toEqual({
      document: nextDocument,
      note: { value: "다음 문서 메모", saveStatus: "saved" },
      recent: {
        documents: [{ path: "/docs/next.md", name: "next.md" }],
        unavailablePaths: new Set(),
        persistenceLimited: false,
      },
      operation: { token: 1, kind: "open" },
    });
  });

  it("only lets the owning operation token release the mutex state", () => {
    const openingState = documentSessionReducer(createDocumentSessionState(), {
      type: "operation-started",
      operation: { token: 2, kind: "reload" },
    });

    expect(
      documentSessionReducer(openingState, {
        type: "operation-finished",
        token: 1,
      }).operation,
    ).toEqual({ token: 2, kind: "reload" });
    expect(
      documentSessionReducer(openingState, {
        type: "operation-finished",
        token: 2,
      }).operation,
    ).toBeNull();
  });

  it("keeps a newer edit dirty when an older save finishes", () => {
    const opened = documentSessionReducer(createDocumentSessionState(), {
      type: "commit-open",
      document: {
        name: "guide.md",
        path: "/docs/guide.md",
        markdown: "original",
        loadedMarkdown: "original",
        revision: "r1",
        format: { hasBom: false, lineEnding: "lf" },
        draftIdentity: "file:/docs/guide.md",
        saveStatus: "saved",
        recovered: false,
        generation: 1,
        editVersion: 1,
      },
      note: "",
      recentDocuments: [],
      unavailablePaths: new Set(),
      persistenceLimited: false,
    });
    const firstEdit = documentSessionReducer(opened, {
      type: "edit-markdown",
      value: "save snapshot",
    });
    const newerEdit = documentSessionReducer(firstEdit, {
      type: "edit-markdown",
      value: "typed while saving",
    });

    const saved = documentSessionReducer(newerEdit, {
      type: "commit-save",
      document: {
        name: "guide.md",
        path: "/docs/guide.md",
        loadedMarkdown: "save snapshot",
        revision: "r2",
        format: { hasBom: false, lineEnding: "lf" },
        draftIdentity: "file:/docs/guide.md",
      },
      savedEditVersion: firstEdit.document.editVersion,
    });

    expect(saved.document.markdown).toBe("typed while saving");
    expect(saved.document.loadedMarkdown).toBe("save snapshot");
    expect(saved.document.saveStatus).toBe("modified");
  });

  it("marks a recovered draft as conflicted without replacing its disk baseline", () => {
    const state = createDocumentSessionState();
    const recovered = documentSessionReducer(state, {
      type: "restore-draft",
      markdown: "recovered edit",
      conflicted: true,
    });

    expect(recovered.document.markdown).toBe("recovered edit");
    expect(recovered.document.loadedMarkdown).toBeNull();
    expect(recovered.document.saveStatus).toBe("conflict");
    expect(recovered.document.recovered).toBe(true);
  });
});
