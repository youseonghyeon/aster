import type {
  FolderListing,
  FolderRoot,
} from "./folder-gateway";

export type FolderDirectoryState = {
  status: "idle" | "loading" | "loaded" | "error";
  requestId: number;
  entries: FolderListing["entries"];
  truncated: boolean;
  error: string | null;
};

export type FolderTreeState = {
  root: FolderRoot | null;
  rootStatus: "idle" | "loading" | "ready" | "error";
  rootRequestId: number;
  rootError: string | null;
  directories: Record<string, FolderDirectoryState>;
  expandedPaths: ReadonlySet<string>;
  selectedPath: string | null;
};

export type FolderTreeAction =
  | { type: "root-loading"; requestId: number }
  | {
      type: "root-ready";
      requestId: number;
      root: FolderRoot;
      expandedPaths: string[];
    }
  | { type: "root-error"; requestId: number; message: string }
  | {
      type: "directory-loading";
      rootToken: number;
      directory: string;
      requestId: number;
    }
  | {
      type: "directory-ready";
      listing: FolderListing;
      requestId: number;
    }
  | {
      type: "directory-error";
      rootToken: number;
      directory: string;
      requestId: number;
      message: string;
    }
  | { type: "toggle-directory"; path: string }
  | { type: "select-entry"; path: string | null }
  | { type: "clear-root" };

const idleDirectory: FolderDirectoryState = {
  status: "idle",
  requestId: 0,
  entries: [],
  truncated: false,
  error: null,
};

export function createFolderTreeState(): FolderTreeState {
  return {
    root: null,
    rootStatus: "idle",
    rootRequestId: 0,
    rootError: null,
    directories: {},
    expandedPaths: new Set(),
    selectedPath: null,
  };
}

export function folderTreeReducer(
  state: FolderTreeState,
  action: FolderTreeAction,
): FolderTreeState {
  switch (action.type) {
    case "root-loading":
      return {
        ...state,
        rootStatus: "loading",
        rootRequestId: action.requestId,
        rootError: null,
      };
    case "root-ready":
      if (state.rootRequestId !== action.requestId) return state;
      return {
        ...state,
        root: action.root,
        rootStatus: "ready",
        rootError: null,
        directories: {},
        expandedPaths: new Set(action.expandedPaths),
        selectedPath: null,
      };
    case "root-error":
      if (state.rootRequestId !== action.requestId) return state;
      return {
        ...state,
        rootStatus: state.root ? "ready" : "error",
        rootError: action.message,
      };
    case "directory-loading": {
      if (state.root?.token !== action.rootToken) return state;
      const current = state.directories[action.directory] ?? idleDirectory;
      return {
        ...state,
        directories: {
          ...state.directories,
          [action.directory]: {
            ...current,
            status: "loading",
            requestId: action.requestId,
            error: null,
          },
        },
      };
    }
    case "directory-ready": {
      if (state.root?.token !== action.listing.rootToken) return state;
      const current = state.directories[action.listing.directory];
      if (!current || current.requestId !== action.requestId) return state;
      return {
        ...state,
        directories: {
          ...state.directories,
          [action.listing.directory]: {
            status: "loaded",
            requestId: action.requestId,
            entries: action.listing.entries,
            truncated: action.listing.truncated,
            error: null,
          },
        },
      };
    }
    case "directory-error": {
      if (state.root?.token !== action.rootToken) return state;
      const current = state.directories[action.directory];
      if (!current || current.requestId !== action.requestId) return state;
      return {
        ...state,
        directories: {
          ...state.directories,
          [action.directory]: {
            ...current,
            status: "error",
            error: action.message,
          },
        },
      };
    }
    case "toggle-directory": {
      const expandedPaths = new Set(state.expandedPaths);
      if (expandedPaths.has(action.path)) expandedPaths.delete(action.path);
      else expandedPaths.add(action.path);
      return { ...state, expandedPaths };
    }
    case "select-entry":
      return { ...state, selectedPath: action.path };
    case "clear-root":
      return createFolderTreeState();
  }
}
