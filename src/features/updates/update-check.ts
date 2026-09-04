import { getVersion } from "@tauri-apps/api/app";
import { invoke, isTauri } from "@tauri-apps/api/core";

export type UpdateCheckResult = {
  currentVersion: string;
  latestVersion: string;
  releaseUrl: string;
  updateAvailable: boolean;
};

type CachedUpdateCheck = {
  version: 1;
  checkedAt: number;
  result: UpdateCheckResult;
};

export const updateCheckStorageKey = "aster:update-check:v1";
export const dismissedUpdateStorageKey = "aster:update-dismissed:v1";
export const updateCheckIntervalMs = 24 * 60 * 60 * 1000;

function isUpdateCheckResult(value: unknown): value is UpdateCheckResult {
  if (!value || typeof value !== "object") return false;
  const result = value as Partial<UpdateCheckResult>;
  return (
    typeof result.currentVersion === "string" &&
    typeof result.latestVersion === "string" &&
    typeof result.releaseUrl === "string" &&
    typeof result.updateAvailable === "boolean"
  );
}

export function loadCachedUpdateCheck(currentVersion: string, now: number) {
  try {
    const raw = localStorage.getItem(updateCheckStorageKey);
    if (!raw) return null;
    const cached = JSON.parse(raw) as Partial<CachedUpdateCheck>;
    if (
      cached.version !== 1 ||
      typeof cached.checkedAt !== "number" ||
      !isUpdateCheckResult(cached.result) ||
      cached.result.currentVersion !== currentVersion ||
      now - cached.checkedAt < 0 ||
      now - cached.checkedAt >= updateCheckIntervalMs
    ) {
      return null;
    }
    return cached.result;
  } catch {
    return null;
  }
}

export function saveCachedUpdateCheck(result: UpdateCheckResult, now: number) {
  try {
    const cached: CachedUpdateCheck = { version: 1, checkedAt: now, result };
    localStorage.setItem(updateCheckStorageKey, JSON.stringify(cached));
  } catch {
    // A failed cache write must not prevent this session's update notice.
  }
}

export function loadDismissedUpdateVersion() {
  try {
    return localStorage.getItem(dismissedUpdateStorageKey);
  } catch {
    return null;
  }
}

export function saveDismissedUpdateVersion(version: string) {
  try {
    localStorage.setItem(dismissedUpdateStorageKey, version);
  } catch {
    // Dismissal still applies to the current session when storage is unavailable.
  }
}

export async function getCurrentAppVersion() {
  return getVersion();
}

export function canCheckForUpdates() {
  return isTauri();
}

export function requestUpdateCheck() {
  return invoke<UpdateCheckResult>("check_for_update");
}
