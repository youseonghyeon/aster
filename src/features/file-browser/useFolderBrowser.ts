import { findCurrentFile } from "./reveal-current-file";
import { flattenVisibleFolderEntries, maximumVisibleTreeEntries } from "./visible-folder-entries";
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
  confirmFolderFileRemoval,
  listFolderChildren,
  openFolderImage,
  openFolderRoot,
  removeFolderFile,
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
  calculateFolderRefreshDelay,
  collectFolderRefreshMetrics,
} from "./folder-refresh-policy";
import {
  createFolderTreeState,
  folderTreeReducer,
  type FolderTreeAction,
} from "./folder-tree-state";

type UseFolderBrowserOptions = { isActive: boolean; currentDocumentPath?: string | null };

type FolderRefreshFlight = {
  rootToken: number;
  epoch: number;
  trailing: boolean;
  priorityDirectories: Set<string>;
  promise: Promise<void>;
};

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

export function useFolderBrowser({ isActive, currentDocumentPath }: UseFolderBrowserOptions) {
  const documentPathRef = useRef(currentDocumentPath);
  documentPathRef.current = currentDocumentPath;
  const [isRevealing, setRevealing] = useState(false);
  const revealFlight = useRef(false);
  const [revealRequest, setRevealRequest] = useState<{ path: string; rootToken: number; id: number } | null>(null);
  const revealEpochRef = useRef(0);
  useEffect(() => { ++revealEpochRef.current; setRevealRequest(null); }, [currentDocumentPath, isActive]);
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
  const [removingFilePath, setRemovingFilePath] = useState<string | null>(null);
  const [state, reducerDispatch] = useReducer(
    folderTreeReducer,
    undefined,
    createFolderTreeState,
  );
  const stateRef = useRef(state);
  const mountedRef = useRef(false);
  const isActiveRef = useRef(isActive);
  const isVisibleRef = useRef(document.visibilityState === "visible");
  const rootRequestRef = useRef(0);
  const directoryRequestRef = useRef(0);
  const activationRef = useRef<Promise<void> | null>(null);
  const schedulerEpochRef = useRef(0);
  const refreshTimerRef = useRef<number | null>(null);
  const refreshFlightRef = useRef<FolderRefreshFlight | null>(null);
  const lastRefreshDurationRef = useRef(0);
  const requestRefreshRef = useRef<
    (priorityDirectory?: string) => Promise<void>
  >(async () => undefined);
  const scheduleNextRefreshRef = useRef<() => void>(() => undefined);
  const removalFlightPathRef = useRef<string | null>(null);

  const clearScheduledRefresh = useCallback(() => {
    if (refreshTimerRef.current === null) return;
    window.clearTimeout(refreshTimerRef.current);
    refreshTimerRef.current = null;
  }, []);

  const invalidateScheduler = useCallback(() => {
    ++schedulerEpochRef.current;
    clearScheduledRefresh();
  }, [clearScheduledRefresh]);

  const isRefreshContextCurrent = useCallback(
    (epoch: number, rootToken: number) =>
      mountedRef.current &&
      isActiveRef.current &&
      isVisibleRef.current &&
      schedulerEpochRef.current === epoch &&
      stateRef.current.root?.token === rootToken,
    [],
  );

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

  const scheduleNextRefresh = useCallback(() => {
    clearScheduledRefresh();
    const root = stateRef.current.root;
    const currentFlight = refreshFlightRef.current;
    const epoch = schedulerEpochRef.current;
    if (
      !root ||
      !mountedRef.current ||
      !isActiveRef.current ||
      !isVisibleRef.current ||
      (currentFlight?.rootToken === root.token &&
        currentFlight.epoch === epoch)
    ) {
      return;
    }
    if (currentFlight) refreshFlightRef.current = null;
    const metrics = collectFolderRefreshMetrics(
      stateRef.current,
      lastRefreshDurationRef.current,
    );
    const delay = calculateFolderRefreshDelay(metrics);
    refreshTimerRef.current = window.setTimeout(() => {
      refreshTimerRef.current = null;
      if (isRefreshContextCurrent(epoch, root.token)) {
        void requestRefreshRef.current();
      }
    }, delay);
  }, [clearScheduledRefresh, isRefreshContextCurrent]);
  scheduleNextRefreshRef.current = scheduleNextRefresh;

  const requestRefresh = useCallback(
    async (priorityDirectory?: string) => {
      clearScheduledRefresh();
      const root = stateRef.current.root;
      if (
        !root ||
        !mountedRef.current ||
        !isActiveRef.current ||
        !isVisibleRef.current
      ) {
        return;
      }
      const epoch = schedulerEpochRef.current;
      const existing = refreshFlightRef.current;
      if (
        existing?.rootToken === root.token &&
        existing.epoch === epoch
      ) {
        existing.trailing = true;
        if (priorityDirectory) {
          existing.priorityDirectories.add(priorityDirectory);
        }
        return existing.promise;
      }
      if (existing) refreshFlightRef.current = null;

      const rootToken = root.token;
      const flight: FolderRefreshFlight = {
        rootToken,
        epoch,
        trailing: true,
        priorityDirectories: new Set(priorityDirectory ? [priorityDirectory] : []),
        promise: Promise.resolve(),
      };
      const promise = (async () => {
        while (flight.trailing) {
          flight.trailing = false;
          const passRoot = stateRef.current.root;
          if (
            !passRoot ||
            !isRefreshContextCurrent(flight.epoch, flight.rootToken)
          ) {
            break;
          }
          const priority = [...flight.priorityDirectories];
          flight.priorityDirectories.clear();
          const directories = new Set([
            ...priority,
            "",
            ...stateRef.current.expandedPaths,
          ]);
          const startedAt = performance.now();
          let completed = true;
          for (const directory of directories) {
            if (!isRefreshContextCurrent(flight.epoch, flight.rootToken)) {
              completed = false;
              break;
            }
            await loadDirectory(passRoot, directory);
            if (!isRefreshContextCurrent(flight.epoch, flight.rootToken)) {
              completed = false;
              break;
            }
          }
          if (completed) {
            lastRefreshDurationRef.current = Math.max(
              0,
              performance.now() - startedAt,
            );
          }
        }
      })();
      flight.promise = promise;
      refreshFlightRef.current = flight;
      try {
        await promise;
      } finally {
        if (refreshFlightRef.current !== flight) return;
        refreshFlightRef.current = null;
        if (isRefreshContextCurrent(epoch, rootToken)) {
          scheduleNextRefreshRef.current();
        }
      }
    },
    [clearScheduledRefresh, isRefreshContextCurrent, loadDirectory],
  );
  requestRefreshRef.current = requestRefresh;

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      invalidateScheduler();
    };
  }, [invalidateScheduler]);

  const registerRoot = useCallback(
    async (path: string, restoreSavedExpansion: boolean) => {
      invalidateScheduler();
      const requestId = ++rootRequestRef.current;
      dispatch({ type: "root-loading", requestId });
      try {
        const root = await openFolderRoot(path);
        if (requestId !== rootRequestRef.current) {
          await closeFolderRoot(root.token).catch(() => undefined);
          return;
        }
        const previousRootToken = stateRef.current.root?.token;
        const expandedPaths =
          restoreSavedExpansion && preferencesRef.current.rootPath === root.path
            ? preferencesRef.current.expandedPaths
            : [];
        invalidateScheduler();
        refreshFlightRef.current = null;
        lastRefreshDurationRef.current = 0;
        dispatch({ type: "root-ready", requestId, root, expandedPaths });
        persist({ rootPath: root.path, expandedPaths });
        if (previousRootToken !== undefined && previousRootToken !== root.token) {
          await closeFolderRoot(previousRootToken).catch(() => undefined);
        }
        await requestRefreshRef.current();
      } catch (error) {
        if (requestId !== rootRequestRef.current) return;
        dispatch({
          type: "root-error",
          requestId,
          message: errorMessage(error),
        });
        scheduleNextRefreshRef.current();
      }
    },
    [dispatch, invalidateScheduler, persist],
  );

  const activate = useCallback(async () => {
    if (stateRef.current.root) {
      if (!stateRef.current.directories[""]) {
        await requestRefreshRef.current();
      }
      return;
    }
    const savedRootPath = preferencesRef.current.rootPath;
    if (savedRootPath) await registerRoot(savedRootPath, true);
  }, [registerRoot]);

  useEffect(() => {
    isActiveRef.current = isActive;
    invalidateScheduler();
    if (!isActive) return;
    const epoch = schedulerEpochRef.current;
    const hadLoadedRoot = Boolean(
      stateRef.current.root && stateRef.current.directories[""],
    );
    let activation = activationRef.current;
    if (!activation) {
      const started = activate();
      activation = started.finally(() => {
        if (activationRef.current === activation) {
          activationRef.current = null;
        }
      });
      activationRef.current = activation;
    }
    void activation.finally(() => {
      if (
        !mountedRef.current ||
        !isActiveRef.current ||
        !isVisibleRef.current ||
        schedulerEpochRef.current !== epoch
      ) {
        return;
      }
      if (hadLoadedRoot) void requestRefreshRef.current();
      else scheduleNextRefreshRef.current();
    });
    return () => {
      isActiveRef.current = false;
      invalidateScheduler();
    };
  }, [activate, invalidateScheduler, isActive]);

  const refresh = useCallback(async (priorityDirectory?: string) => {
    // A native menu can outlive the root for which it was opened.
    if (stateRef.current.root?.token !== state.root?.token) return;
    await requestRefresh(priorityDirectory);
  }, [requestRefresh, state.root?.token]);

  useEffect(() => {
    function handleVisibilityChange() {
      const isVisible = document.visibilityState === "visible";
      if (isVisibleRef.current === isVisible) return;
      isVisibleRef.current = isVisible;
      invalidateScheduler();
      if (isVisible && isActiveRef.current) {
        void requestRefreshRef.current();
      }
    }
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () =>
      document.removeEventListener("visibilitychange", handleVisibilityChange);
  }, [invalidateScheduler]);

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
    invalidateScheduler();
    refreshFlightRef.current = null;
    lastRefreshDurationRef.current = 0;
    const token = stateRef.current.root?.token;
    ++rootRequestRef.current;
    dispatch({ type: "clear-root" });
    setOperationError(null);
    persist({ rootPath: null, expandedPaths: [] });
    await closeFolderRoot(token).catch(() => undefined);
  }, [dispatch, invalidateScheduler, persist]);

  const toggleDirectory = useCallback(
    (entry: FolderEntry) => {
      if (entry.kind !== "directory") return;
      const wasExpanded = stateRef.current.expandedPaths.has(entry.relativePath);
      dispatch({ type: "select-entry", path: entry.relativePath });
      dispatch({ type: "toggle-directory", path: entry.relativePath });
      const expandedPaths = Array.from(stateRef.current.expandedPaths);
      persist({ expandedPaths });
      if (!wasExpanded) void requestRefreshRef.current(entry.relativePath);
      else scheduleNextRefreshRef.current();
    },
    [dispatch, persist],
  );

  const selectEntry = useCallback(
    (path: string) => dispatch({ type: "select-entry", path }),
    [dispatch],
  );

  const revealCurrentFile = useCallback(async (path: string) => {
    const root = stateRef.current.root;
    if (!root || revealFlight.current) return;
    revealFlight.current = true; setRevealing(true); setOperationError(null);
    const rootRequest = rootRequestRef.current;
    const focus = document.activeElement;
    const epoch = revealEpochRef.current;
    let focusChanged = false;
    const cancelOnFocusChange = () => { if (document.activeElement !== focus) focusChanged = true; };
    document.addEventListener("focusin", cancelOnFocusChange);
    const valid = () => mountedRef.current && isActiveRef.current && stateRef.current.root?.token === root.token &&
      rootRequestRef.current === rootRequest && revealEpochRef.current === epoch && !focusChanged && (documentPathRef.current === undefined || documentPathRef.current === path) && document.activeElement === focus;
    try {
      const found = await findCurrentFile(root, path, async (directory) => {
        await loadDirectory(root, directory);
        const listing = stateRef.current.directories[directory];
        if (!listing || listing.status !== "loaded") throw new Error(listing?.error ?? "목록을 확인하지 못했습니다. 다시 시도해 주세요.");
        return listing;
      }, valid);
      if (!found || !valid()) return;
      const expandedPaths = new Set([...stateRef.current.expandedPaths, ...found.ancestors]);
      const candidate = { ...stateRef.current, expandedPaths };
      if (!flattenVisibleFolderEntries(candidate, maximumVisibleTreeEntries).some(entry => entry.relativePath === found.path)) {
        throw new Error("목록 표시 한도로 현재 파일을 표시하지 못했습니다. 다른 폴더를 접고 다시 시도해 주세요.");
      }
      for (const ancestor of found.ancestors) {
        if (!stateRef.current.expandedPaths.has(ancestor)) dispatch({ type: "toggle-directory", path: ancestor });
      }
      persist({ expandedPaths: Array.from(stateRef.current.expandedPaths) });
      dispatch({ type: "select-entry", path: found.path });
      setRevealRequest(previous => ({ path: found.path, rootToken: root.token, id: (previous?.id ?? 0) + 1 }));
    } catch (error) { if (valid()) setOperationError(errorMessage(error)); }
    finally {
      document.removeEventListener("focusin", cancelOnFocusChange);
      revealFlight.current = false;
      if (mountedRef.current) setRevealing(false);
    }
  }, [dispatch, loadDirectory, persist]);

  const retryDirectory = useCallback(
    (directory: string) => {
      void requestRefreshRef.current(directory);
    },
    [],
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

  const removeFile = useCallback(
    async (entry: FolderEntry) => {
      const root = stateRef.current.root;
      if (
        !root ||
        entry.kind === "directory" ||
        removalFlightPathRef.current !== null
      ) {
        return;
      }

      const removalPath = entry.relativePath;
      removalFlightPathRef.current = removalPath;
      setRemovingFilePath(removalPath);
      setOperationError(null);
      try {
        const approved = await confirmFolderFileRemoval(entry.name);
        if (
          !approved ||
          !mountedRef.current ||
          stateRef.current.root?.token !== root.token
        ) {
          return;
        }

        await removeFolderFile(root.token, removalPath);
        const currentRoot = stateRef.current.root;
        if (!mountedRef.current || currentRoot?.token !== root.token) return;
        const separator = removalPath.lastIndexOf("/");
        const parentDirectory =
          separator < 0 ? "" : removalPath.slice(0, separator);
        await loadDirectory(currentRoot, parentDirectory);
      } catch (error) {
        if (
          mountedRef.current &&
          stateRef.current.root?.token === root.token
        ) {
          setOperationError(errorMessage(error));
        }
      } finally {
        if (removalFlightPathRef.current === removalPath) {
          removalFlightPathRef.current = null;
          if (mountedRef.current) setRemovingFilePath(null);
        }
      }
    },
    [loadDirectory],
  );

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
    removingFilePath,
    revealRequest,
    isRevealing,
    actions: {
      chooseRoot,
      clearRoot,
      refresh,
      toggleDirectory,
      selectEntry,
      revealCurrentFile,
      retryDirectory,
      openImage,
      removeFile,
      setView,
      setSidebarWidth,
    },
  };
}
