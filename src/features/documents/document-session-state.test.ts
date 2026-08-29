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
});
