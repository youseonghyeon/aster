import { useCallback, useEffect, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import {
  canCheckForUpdates,
  getCurrentAppVersion,
  loadCachedUpdateCheck,
  loadDismissedUpdateVersion,
  requestUpdateCheck,
  saveCachedUpdateCheck,
  saveDismissedUpdateVersion,
  type UpdateCheckResult,
} from "./update-check";

export function useUpdateCheck() {
  const [visibleUpdateCheck, setVisibleUpdateCheck] =
    useState<UpdateCheckResult | null>(null);

  useEffect(() => {
    if (!canCheckForUpdates()) return;
    let active = true;

    async function check(force: boolean) {
      try {
        const currentVersion = await getCurrentAppVersion();
        const now = Date.now();
        const cachedResult = force
          ? null
          : loadCachedUpdateCheck(currentVersion, now);
        const result = cachedResult ?? (await requestUpdateCheck());
        if (!cachedResult) {
          saveCachedUpdateCheck(result, now);
        }
        if (
          active &&
          (force ||
            (result.updateAvailable &&
              loadDismissedUpdateVersion() !== result.latestVersion))
        ) {
          setVisibleUpdateCheck(result);
        }
      } catch {
        // Update checks are opportunistic and must never interrupt reading.
      }
    }

    void check(false);
    const unlistenPromise = listen("update-check-requested", () => {
      void check(true);
    });
    return () => {
      active = false;
      void unlistenPromise.then((unlisten) => unlisten());
    };
  }, []);

  const dismiss = useCallback(() => {
    setVisibleUpdateCheck((current) => {
      if (current?.updateAvailable) {
        saveDismissedUpdateVersion(current.latestVersion);
      }
      return null;
    });
  }, []);

  return { visibleUpdateCheck, dismiss };
}
