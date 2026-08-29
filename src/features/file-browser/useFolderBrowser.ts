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
  calculateFolderRefreshDelay,
  collectFolderRefreshMetrics,
} from "./folder-refresh-policy";
import {
  createFolderTreeState,
  folderTreeReducer,
  type FolderTreeAction,
} from "./folder-tree-state";

type UseFolderBrowserOptions = { isActive: boolean };

type FolderRefreshFlight = {
  rootToken: number;
  epoch: number;
  trailing: boolean;
  priorityDirectory: string | null;
  promise: Promise<void>;
};

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
          existing.priorityDirectory = priorityDirectory;
        }
        return existing.promise;
      }
      if (existing) refreshFlightRef.current = null;

      const rootToken = root.token;
      const flight: FolderRefreshFlight = {
        rootToken,
        epoch,
        trailing: true,
        priorityDirectory: priorityDirectory ?? null,
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
          const priority = flight.priorityDirectory;
          flight.priorityDirectory = null;
          const directories = new Set([
            ...(priority ? [priority] : []),
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

  const refresh = useCallback(async () => {
    await requestRefresh();
  }, [requestRefresh]);

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
