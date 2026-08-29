import {
  useCallback,
  useEffect,
  useReducer,
  useRef,
  useState,
} from "react";
import {
  chooseFolderPath,
  closeFolderRoot,
  listFolderChildren,
  openFolderImage,
  openFolderRoot,
  type FolderEntry,
  type FolderRoot,
} from "./folder-gateway";
import {
  clampFolderSidebarWidth,
  loadFolderBrowserPreferences,
  saveFolderBrowserPreferences,
  type FolderBrowserPreferences,
  type FolderBrowserView,
} from "./folder-preferences";
import {
  createFolderTreeState,
  folderTreeReducer,
  type FolderTreeAction,
} from "./folder-tree-state";

type UseFolderBrowserOptions = { isActive: boolean };

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

export function useFolderBrowser({ isActive }: UseFolderBrowserOptions) {
  const initialPreferencesRef = useRef<FolderBrowserPreferences | null>(null);
  if (initialPreferencesRef.current === null) {
    initialPreferencesRef.current = loadFolderBrowserPreferences();
  }
  const preferencesRef = useRef(initialPreferencesRef.current);
  const [view, setViewState] = useState<FolderBrowserView>(
    initialPreferencesRef.current.view,
  );
  const [sidebarWidth, setSidebarWidthState] = useState(
    initialPreferencesRef.current.sidebarWidth,
  );
  const [isPersistenceLimited, setPersistenceLimited] = useState(false);
  const [operationError, setOperationError] = useState<string | null>(null);
  const [state, reducerDispatch] = useReducer(
    folderTreeReducer,
    undefined,
    createFolderTreeState,
  );
  const stateRef = useRef(state);
  const rootRequestRef = useRef(0);
  const directoryRequestRef = useRef(0);
  const activationRef = useRef<Promise<void> | null>(null);

  const dispatch = useCallback((action: FolderTreeAction) => {
    stateRef.current = folderTreeReducer(stateRef.current, action);
    reducerDispatch(action);
  }, []);

  const persist = useCallback(
    (updates: Partial<FolderBrowserPreferences>) => {
      const next = { ...preferencesRef.current, ...updates };
      preferencesRef.current = next;
      setPersistenceLimited(!saveFolderBrowserPreferences(next));
    },
    [],
  );

  const loadDirectory = useCallback(
    async (root: FolderRoot, directory: string) => {
      const requestId = ++directoryRequestRef.current;
      dispatch({
        type: "directory-loading",
        rootToken: root.token,
        directory,
        requestId,
      });
      try {
        const listing = await listFolderChildren(root.token, directory);
        dispatch({ type: "directory-ready", listing, requestId });
      } catch (error) {
        dispatch({
          type: "directory-error",
          rootToken: root.token,
          directory,
          requestId,
          message: errorMessage(error),
        });
      }
    },
    [dispatch],
  );

  const registerRoot = useCallback(
    async (path: string, restoreSavedExpansion: boolean) => {
      const requestId = ++rootRequestRef.current;
      dispatch({ type: "root-loading", requestId });
      try {
        const root = await openFolderRoot(path);
        if (requestId !== rootRequestRef.current) return;
        const expandedPaths =
          restoreSavedExpansion && preferencesRef.current.rootPath === root.path
            ? preferencesRef.current.expandedPaths
            : [];
        dispatch({ type: "root-ready", requestId, root, expandedPaths });
        persist({ rootPath: root.path, expandedPaths });
        await Promise.all([
          loadDirectory(root, ""),
          ...expandedPaths.map((directory) => loadDirectory(root, directory)),
        ]);
      } catch (error) {
        if (requestId !== rootRequestRef.current) return;
        dispatch({
          type: "root-error",
          requestId,
          message: errorMessage(error),
        });
      }
    },
    [dispatch, loadDirectory, persist],
  );

  const activate = useCallback(async () => {
    if (stateRef.current.root) {
      if (!stateRef.current.directories[""]) {
        await loadDirectory(stateRef.current.root, "");
      }
      return;
    }
    const savedRootPath = preferencesRef.current.rootPath;
    if (savedRootPath) await registerRoot(savedRootPath, true);
  }, [loadDirectory, registerRoot]);

  useEffect(() => {
    if (!isActive || activationRef.current) return;
    const activation = activate().finally(() => {
      if (activationRef.current === activation) activationRef.current = null;
    });
    activationRef.current = activation;
  }, [activate, isActive]);

  const refresh = useCallback(async () => {
    const root = stateRef.current.root;
    if (!root) return;
    const directories = ["", ...stateRef.current.expandedPaths];
    await Promise.all(
      Array.from(new Set(directories)).map((directory) =>
        loadDirectory(root, directory),
      ),
    );
  }, [loadDirectory]);

  useEffect(() => {
    if (!isActive) return;
    function handleVisibilityChange() {
      if (document.visibilityState === "visible") void refresh();
    }
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () =>
      document.removeEventListener("visibilitychange", handleVisibilityChange);
  }, [isActive, refresh]);

  const chooseRoot = useCallback(async () => {
    setOperationError(null);
    try {
      const path = await chooseFolderPath();
      if (path) await registerRoot(path, false);
    } catch (error) {
      setOperationError(errorMessage(error));
    }
  }, [registerRoot]);

  const clearRoot = useCallback(async () => {
    const token = stateRef.current.root?.token;
    ++rootRequestRef.current;
    dispatch({ type: "clear-root" });
    setOperationError(null);
    persist({ rootPath: null, expandedPaths: [] });
    await closeFolderRoot(token).catch(() => undefined);
  }, [dispatch, persist]);

  const toggleDirectory = useCallback(
    (entry: FolderEntry) => {
      if (entry.kind !== "directory") return;
      const wasExpanded = stateRef.current.expandedPaths.has(entry.relativePath);
      dispatch({ type: "select-entry", path: entry.relativePath });
      dispatch({ type: "toggle-directory", path: entry.relativePath });
      const expandedPaths = Array.from(stateRef.current.expandedPaths);
      persist({ expandedPaths });
      if (!wasExpanded && stateRef.current.root) {
        const directory = stateRef.current.directories[entry.relativePath];
        if (!directory || directory.status === "idle" || directory.status === "error") {
          void loadDirectory(stateRef.current.root, entry.relativePath);
        }
      }
    },
    [dispatch, loadDirectory, persist],
  );

  const selectEntry = useCallback(
    (path: string) => dispatch({ type: "select-entry", path }),
    [dispatch],
  );

  const retryDirectory = useCallback(
    (directory: string) => {
      const root = stateRef.current.root;
      if (root) void loadDirectory(root, directory);
    },
    [loadDirectory],
  );

  const openImage = useCallback(async (entry: FolderEntry) => {
    const root = stateRef.current.root;
    if (!root || entry.kind !== "image") return;
    setOperationError(null);
    try {
      await openFolderImage(root.token, entry.relativePath);
    } catch (error) {
      setOperationError(errorMessage(error));
    }
  }, []);

  const setView = useCallback(
    (nextView: FolderBrowserView) => {
      setViewState(nextView);
      persist({ view: nextView });
    },
    [persist],
  );

  const setSidebarWidth = useCallback(
    (width: number) => {
      const nextWidth = clampFolderSidebarWidth(width);
      setSidebarWidthState(nextWidth);
      persist({ sidebarWidth: nextWidth });
    },
    [persist],
  );

  return {
    state,
    view,
    sidebarWidth,
    isPersistenceLimited,
    operationError,
    actions: {
      chooseRoot,
      clearRoot,
      refresh,
      toggleDirectory,
      selectEntry,
      retryDirectory,
      openImage,
      setView,
      setSidebarWidth,
    },
  };
}
