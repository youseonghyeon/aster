import {
  getDocumentDraftIdentity,
  loadDocumentNote,
  untitledDocumentNoteStorageKey,
} from "./document-session";
import { initialMarkdown } from "./initial-document";
import {
  loadRecentDocuments,
  type RecentDocument,
} from "./recent-documents";
import type { MarkdownTextFormat } from "./markdown-files";

export type NoteSaveStatus = "saved" | "saving" | "error";
export type MarkdownSaveStatus =
  | "saved"
  | "modified"
  | "saving"
  | "conflict"
  | "error";
export type DocumentOperationKind = "open" | "reload" | "save" | "external";

export type DocumentSnapshot = {
  name: string;
  path: string | null;
  markdown: string;
  loadedMarkdown: string | null;
  revision: string | null;
  format: MarkdownTextFormat;
  draftIdentity: string;
  saveStatus: MarkdownSaveStatus;
  recovered: boolean;
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
  | { type: "save-started" }
  | { type: "save-failed" }
  | { type: "external-conflict" }
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
      type: "commit-save";
      document: Pick<
        DocumentSnapshot,
        "name" | "path" | "loadedMarkdown" | "revision" | "format" | "draftIdentity"
      >;
      savedEditVersion: number;
      recentDocuments?: RecentDocument[];
      persistenceLimited?: boolean;
    }
  | {
      type: "commit-reload";
      name: string;
      markdown: string;
      revision: string;
      format: MarkdownTextFormat;
      external: boolean;
    }
  | {
      type: "restore-draft";
      markdown: string;
      conflicted: boolean;
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
      format: { hasBom: false, lineEnding: "lf" },
      draftIdentity: getDocumentDraftIdentity(null),
      saveStatus: "saved",
      recovered: false,
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
      const baseline = state.document.loadedMarkdown ?? initialMarkdown;
      return {
        ...state,
        document: {
          ...state.document,
          markdown: action.value,
          editVersion: state.document.editVersion + 1,
          saveStatus:
            action.value === baseline ? "saved" : "modified",
          recovered:
            action.value === baseline ? false : state.document.recovered,
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
    case "save-started":
      return {
        ...state,
        document: { ...state.document, saveStatus: "saving" },
      };
    case "save-failed":
      return {
        ...state,
        document: { ...state.document, saveStatus: "error" },
      };
    case "external-conflict":
      return {
        ...state,
        document: { ...state.document, saveStatus: "conflict" },
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
    case "commit-save": {
      const hasNewerEdit = state.document.editVersion !== action.savedEditVersion;
      return {
        ...state,
        document: {
          ...state.document,
          ...action.document,
          markdown: hasNewerEdit
            ? state.document.markdown
            : (action.document.loadedMarkdown ?? state.document.markdown),
          saveStatus: hasNewerEdit ? "modified" : "saved",
          recovered: hasNewerEdit && state.document.recovered,
        },
        recent: action.recentDocuments
          ? {
              ...state.recent,
              documents: action.recentDocuments,
              persistenceLimited: action.persistenceLimited ?? false,
            }
          : state.recent,
      };
    }
    case "commit-reload":
      return {
        ...state,
        document: {
          ...state.document,
          name: action.name,
          markdown: action.markdown,
          loadedMarkdown: action.markdown,
          revision: action.revision,
          format: action.format,
          saveStatus: "saved",
          recovered: false,
          editVersion: state.document.editVersion + 1,
        },
      };
    case "restore-draft":
      return {
        ...state,
        document: {
          ...state.document,
          markdown: action.markdown,
          editVersion: state.document.editVersion + 1,
          saveStatus: action.conflicted ? "conflict" : "modified",
          recovered: true,
        },
      };
    case "set-unavailable-paths":
      return {
        ...state,
        recent: { ...state.recent, unavailablePaths: action.paths },
      };
  }
}
