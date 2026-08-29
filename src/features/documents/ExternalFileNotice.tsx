import type { Ref } from "react";
import type { ExternalFileState } from "./useExternalFileStatus";

function FileChangeIcon({ kind }: { kind: ExternalFileState["kind"] }) {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true">
      {kind === "modified" ? (
        <>
          <path d="M10 3.25a6.75 6.75 0 1 0 6.2 4.08" />
          <path d="M13.25 3.25H16.5V6.5M16.5 3.25l-3.7 3.7" />
        </>
      ) : (
        <>
          <path d="M10 3.25 17 16H3L10 3.25Z" />
          <path d="M10 7.4v4.2M10 14.1v.1" />
        </>
      )}
    </svg>
  );
}

type ExternalFileNoticeProps = {
  state: ExternalFileState;
  isReloading: boolean;
  noticeRef: Ref<HTMLElement>;
  onReload: () => void;
  onDismiss: () => void;
};

export function ExternalFileNotice({
  state,
  isReloading,
  noticeRef,
  onReload,
  onDismiss,
}: ExternalFileNoticeProps) {
  const messageText =
    state.kind === "modified"
      ? "원본 파일이 다른 앱에서 변경되었습니다."
      : "원본 파일을 확인할 수 없습니다. 현재 내용은 그대로 유지됩니다.";

  return (
    <aside
      ref={noticeRef}
      className={`external-file-notice is-${state.kind}`}
      aria-label="원본 파일 상태"
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          event.stopPropagation();
          onDismiss();
        }
      }}
    >
      <span className="external-file-notice-icon">
        <FileChangeIcon kind={state.kind} />
      </span>
      <span
        className="external-file-notice-message"
        role="status"
        aria-live="polite"
      >
        <strong>
          {state.kind === "modified" ? "새 변경 사항" : "파일 연결 끊김"}
        </strong>
        <span>{messageText}</span>
      </span>
      <button
        type="button"
        className="external-file-reload"
        disabled={isReloading}
        onClick={onReload}
      >
        {isReloading
          ? "확인 중…"
          : state.kind === "modified"
            ? "다시 불러오기"
            : "다시 확인"}
      </button>
      <button
        type="button"
        className="external-file-dismiss"
        aria-label="원본 파일 상태 알림 닫기"
        title="닫기"
        onClick={onDismiss}
      >
        <span aria-hidden="true">×</span>
      </button>
    </aside>
  );
}
