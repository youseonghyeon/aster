import { loadDocumentNote, untitledDocumentNoteStorageKey } from "./document-session";
import { initialMarkdown } from "./initial-document";
import {
  loadRecentDocuments,
  type RecentDocument,
} from "./recent-documents";

export type NoteSaveStatus = "saved" | "saving" | "error";
export type DocumentOperationKind = "open" | "reload";

export type DocumentSnapshot = {
  name: string;
  path: string | null;
  markdown: string;
  loadedMarkdown: string | null;
  revision: string | null;
  generation: number;
  editVersion: number;
};

export type DocumentOperation = {
  token: number;
  kind: DocumentOperationKind;
};

export type DocumentSessionState = {
  document: DocumentSnapshot;
  note: {
    value: string;
    saveStatus: NoteSaveStatus;
  };
  recent: {
    documents: RecentDocument[];
    unavailablePaths: Set<string>;
    persistenceLimited: boolean;
  };
  operation: DocumentOperation | null;
};

export type DocumentSessionAction =
  | { type: "edit-markdown"; value: string }
  | { type: "edit-note"; value: string }
  | { type: "note-save-result"; status: "saved" | "error" }
  | { type: "operation-started"; operation: DocumentOperation }
  | { type: "operation-finished"; token: number }
  | {
      type: "commit-open";
      document: DocumentSnapshot;
      note: string;
      recentDocuments: RecentDocument[];
      unavailablePaths: Set<string>;
      persistenceLimited: boolean;
    }
  | {
      type: "commit-reload";
      name: string;
      markdown: string;
      revision: string;
    }
  | { type: "set-unavailable-paths"; paths: Set<string> };

export function createDocumentSessionState(): DocumentSessionState {
  return {
    document: {
      name: "새 문서.md",
      path: null,
      markdown: initialMarkdown,
      loadedMarkdown: null,
      revision: null,
      generation: 0,
      editVersion: 0,
    },
    note: {
      value: loadDocumentNote(untitledDocumentNoteStorageKey),
      saveStatus: "saved",
    },
    recent: {
      documents: loadRecentDocuments(),
      unavailablePaths: new Set(),
      persistenceLimited: false,
    },
    operation: null,
  };
}

export function documentSessionReducer(
  state: DocumentSessionState,
  action: DocumentSessionAction,
): DocumentSessionState {
  switch (action.type) {
    case "edit-markdown":
      return {
        ...state,
        document: {
          ...state.document,
          markdown: action.value,
          editVersion: state.document.editVersion + 1,
        },
      };
    case "edit-note":
      return {
        ...state,
        note: { value: action.value, saveStatus: "saving" },
      };
    case "note-save-result":
      return {
        ...state,
        note: { ...state.note, saveStatus: action.status },
      };
    case "operation-started":
      return { ...state, operation: action.operation };
    case "operation-finished":
      return state.operation?.token === action.token
        ? { ...state, operation: null }
        : state;
    case "commit-open":
      return {
        document: action.document,
        note: { value: action.note, saveStatus: "saved" },
        recent: {
          documents: action.recentDocuments,
          unavailablePaths: action.unavailablePaths,
          persistenceLimited: action.persistenceLimited,
        },
        operation: state.operation,
      };
    case "commit-reload":
      return {
        ...state,
        document: {
          ...state.document,
          name: action.name,
          markdown: action.markdown,
          loadedMarkdown: action.markdown,
          revision: action.revision,
        },
      };
    case "set-unavailable-paths":
      return {
        ...state,
        recent: { ...state.recent, unavailablePaths: action.paths },
      };
  }
}
