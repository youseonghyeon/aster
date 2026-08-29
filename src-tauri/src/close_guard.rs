use crate::recovery::{
    delete_recovery_draft_in, recovery_root, DeleteRecoveryDraftRequest, RecoveryState,
};
use serde::Deserialize;
use std::sync::{
    atomic::{AtomicBool, AtomicU64, Ordering},
    Mutex,
};
use tauri::{Emitter, Manager, Window, WindowEvent};

#[derive(Debug)]
pub(crate) struct CloseGuardState {
    ready: AtomicBool,
    allow_once: AtomicBool,
    next_request_id: AtomicU64,
    pending_request_id: Mutex<Option<u64>>,
}

impl Default for CloseGuardState {
    fn default() -> Self {
        Self {
            ready: AtomicBool::new(false),
            allow_once: AtomicBool::new(false),
            next_request_id: AtomicU64::new(0),
            pending_request_id: Mutex::new(None),
        }
    }
}

impl CloseGuardState {
    fn begin_request(&self) -> Result<Option<u64>, String> {
        let mut pending = self
            .pending_request_id
            .lock()
            .map_err(|_| "종료 요청 상태를 사용할 수 없습니다.".to_owned())?;
        if pending.is_some() {
            return Ok(None);
        }
        let request_id = self.next_request_id.fetch_add(1, Ordering::Relaxed) + 1;
        *pending = Some(request_id);
        Ok(Some(request_id))
    }
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ResolveCloseRequest {
    pub(crate) request_id: u64,
    pub(crate) allow: bool,
    pub(crate) discard_draft: Option<DeleteRecoveryDraftRequest>,
}

pub(crate) fn enable_close_guard(state: &CloseGuardState) {
    state.ready.store(true, Ordering::Release);
}

pub(crate) fn handle_window_event(window: &Window, event: &WindowEvent) {
    let WindowEvent::CloseRequested { api, .. } = event else {
        return;
    };
    let state = window.state::<CloseGuardState>();
    if !state.ready.load(Ordering::Acquire) || state.allow_once.swap(false, Ordering::AcqRel) {
        return;
    }

    api.prevent_close();
    if let Ok(Some(request_id)) = state.begin_request() {
        let _ = window.emit("app-close-requested", request_id);
    }
}

pub(crate) fn resolve_close_request(
    window: Window,
    close_state: &CloseGuardState,
    recovery_state: &RecoveryState,
    request: ResolveCloseRequest,
) -> Result<(), String> {
    let mut pending = close_state
        .pending_request_id
        .lock()
        .map_err(|_| "종료 요청 상태를 사용할 수 없습니다.".to_owned())?;
    if *pending != Some(request.request_id) {
        return Ok(());
    }
    if !request.allow {
        *pending = None;
        return Ok(());
    }

    if let Some(discard) = request.discard_draft {
        let app_data_dir = window
            .app_handle()
            .path()
            .app_data_dir()
            .map_err(|error| format!("앱 데이터 폴더를 확인할 수 없습니다: {error}"))?;
        delete_recovery_draft_in(&recovery_root(app_data_dir), recovery_state, discard)?;
    }

    *pending = None;
    close_state.allow_once.store(true, Ordering::Release);
    if let Err(error) = window.close() {
        close_state.allow_once.store(false, Ordering::Release);
        return Err(format!("앱을 닫을 수 없습니다: {error}"));
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn close_guard_starts_unready_and_coalescing_state_is_empty() {
        let state = CloseGuardState::default();
        assert!(!state.ready.load(Ordering::Acquire));
        assert!(!state.allow_once.load(Ordering::Acquire));
        assert_eq!(*state.pending_request_id.lock().unwrap(), None);
    }

    #[test]
    fn coalesces_repeated_close_requests_until_the_pending_one_resolves() {
        let state = CloseGuardState::default();
        assert_eq!(state.begin_request().unwrap(), Some(1));
        assert_eq!(state.begin_request().unwrap(), None);
        *state.pending_request_id.lock().unwrap() = None;
        assert_eq!(state.begin_request().unwrap(), Some(2));
    }
}
