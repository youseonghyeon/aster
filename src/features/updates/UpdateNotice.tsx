import { openUrl } from "@tauri-apps/plugin-opener";
import { useEffect } from "react";
import type { UpdateCheckResult } from "./update-check";
import "./UpdateNotice.css";

const currentVersionNoticeDurationMs = 5_000;

type UpdateNoticeProps = {
  update: UpdateCheckResult;
  isStacked: boolean;
  onDismiss: () => void;
};

function UpdateIcon() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true">
      <path d="M10 3.25v9.5M6.25 9l3.75 3.75L13.75 9" />
      <path d="M4 15.75h12" />
    </svg>
  );
}

export function UpdateNotice({
  update,
  isStacked,
  onDismiss,
}: UpdateNoticeProps) {
  useEffect(() => {
    if (update.updateAvailable) return;

    const timeout = window.setTimeout(
      onDismiss,
      currentVersionNoticeDurationMs,
    );
    return () => window.clearTimeout(timeout);
  }, [
    onDismiss,
    update.currentVersion,
    update.latestVersion,
    update.updateAvailable,
  ]);

  return (
    <aside
      className={`update-notice${isStacked ? " is-stacked" : ""}`}
      aria-label="Aster 업데이트"
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          event.stopPropagation();
          onDismiss();
        }
      }}
    >
      <span className="update-notice-icon">
        <UpdateIcon />
      </span>
      <span className="update-notice-message" role="status" aria-live="polite">
        <strong>
          {update.updateAvailable
            ? `새 버전 ${update.latestVersion}`
            : "최신 버전입니다"}
        </strong>
        <span>현재 {update.currentVersion}</span>
      </span>
      {update.updateAvailable ? (
        <button
          type="button"
          className="update-notice-open"
          onClick={() => void openUrl(update.releaseUrl).catch(() => undefined)}
        >
          업데이트 보기
        </button>
      ) : null}
      <button
        type="button"
        className="update-notice-dismiss"
        aria-label="업데이트 알림 닫기"
        title="닫기"
        onClick={onDismiss}
      >
        <span aria-hidden="true">×</span>
      </button>
    </aside>
  );
}
