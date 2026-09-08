use serde::Serialize;
use std::sync::{
    atomic::{AtomicBool, Ordering},
    Mutex,
};
use std::time::Duration;
use tauri::{ipc::Channel, AppHandle, Manager, State};
use tauri_plugin_updater::{Update, UpdaterExt};

#[derive(Default)]
pub(crate) struct UpdateState {
    busy: AtomicBool,
    downloaded: Mutex<Option<(Update, Vec<u8>)>>,
}

struct BusyGuard<'a>(&'a AtomicBool);
impl Drop for BusyGuard<'_> {
    fn drop(&mut self) {
        self.0.store(false, Ordering::Release);
    }
}
impl UpdateState {
    fn begin(&self) -> Result<BusyGuard<'_>, String> {
        self.busy
            .compare_exchange(false, true, Ordering::AcqRel, Ordering::Acquire)
            .map_err(|_| "업데이트 작업이 이미 진행 중입니다.".to_owned())?;
        Ok(BusyGuard(&self.busy))
    }
}

fn supported(identifier: &str, debug: bool) -> bool {
    !debug && identifier == "com.yuseonghyeon.aster"
}

#[tauri::command]
pub(crate) fn can_install_update(app: AppHandle) -> bool {
    supported(&app.config().identifier, cfg!(debug_assertions))
}
fn require_supported(app: &AppHandle) -> Result<(), String> {
    if can_install_update(app.clone()) {
        Ok(())
    } else {
        Err("앱 내 설치는 정식 Aster에서 사용할 수 있습니다.".into())
    }
}

fn valid_download_url(value: &str, version: &str) -> bool {
    let Ok(url) = reqwest::Url::parse(value) else {
        return false;
    };
    url.scheme() == "https"
        && url.host_str() == Some("github.com")
        && url.username().is_empty()
        && url.password().is_none()
        && url.query().is_none()
        && url.fragment().is_none()
        && url.path().starts_with(&format!(
            "/youseonghyeon/aster/releases/download/v{version}/"
        ))
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct DownloadProgress {
    downloaded: u64,
    total: Option<u64>,
}

#[tauri::command]
pub(crate) async fn download_app_update(
    app: AppHandle,
    state: State<'_, UpdateState>,
    version: String,
    on_progress: Channel<DownloadProgress>,
) -> Result<(), String> {
    require_supported(&app)?;
    let _busy = state.begin()?;
    let update = app
        .updater_builder()
        .timeout(Duration::from_secs(300))
        .build()
        .map_err(|e| e.to_string())?
        .check()
        .await
        .map_err(|e| e.to_string())?
        .ok_or("설치할 새 버전이 없습니다. 업데이트를 다시 확인해 주세요.")?;
    if update.version != version {
        return Err("새 버전 정보가 변경되었습니다. 업데이트를 다시 확인해 주세요.".into());
    }
    if !valid_download_url(update.download_url.as_str(), &version) {
        return Err("허용되지 않은 업데이트 파일 주소입니다.".into());
    }
    let mut downloaded = 0u64;
    let bytes = update
        .download(
            |chunk, total| {
                downloaded += chunk as u64;
                let _ = on_progress.send(DownloadProgress { downloaded, total });
            },
            || {},
        )
        .await
        .map_err(|e| format!("업데이트 다운로드 또는 서명 확인에 실패했습니다: {e}"))?;
    // download() verifies the signature before returning any installable bytes.
    *state
        .downloaded
        .lock()
        .map_err(|_| "업데이트 상태를 사용할 수 없습니다.")? = Some((update, bytes));
    Ok(())
}

#[tauri::command]
pub(crate) async fn install_app_update(app: AppHandle, version: String) -> Result<(), String> {
    require_supported(&app)?;
    tauri::async_runtime::spawn_blocking(move || {
        let state = app.state::<UpdateState>();
        let _busy = state.begin()?;
        let downloaded = state
            .downloaded
            .lock()
            .map_err(|_| "업데이트 상태를 사용할 수 없습니다.")?;
        let (update, bytes) = downloaded
            .as_ref()
            .ok_or("먼저 업데이트를 다운로드해 주세요.")?;
        if update.version != version {
            return Err("다운로드한 버전이 일치하지 않습니다.".into());
        }
        // Installation can exit the process without emitting CloseRequested.
        // Persist before install (not just restart) for Windows installers too.
        let window = app
            .get_webview_window("main")
            .ok_or("창 상태를 저장할 창을 찾을 수 없습니다.")?;
        crate::window_geometry::save(&window.as_ref().window())?;
        update
            .install(bytes)
            .map_err(|e| format!("업데이트 설치에 실패했습니다: {e}"))?;
        app.restart();
    })
    .await
    .map_err(|e| format!("업데이트 설치 작업을 완료하지 못했습니다: {e}"))?
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn downloads_only_from_the_selected_release() {
        assert!(valid_download_url(
            "https://github.com/youseonghyeon/aster/releases/download/v1.9.0/Aster.app.tar.gz",
            "1.9.0"
        ));
        for url in [
            "http://github.com/youseonghyeon/aster/releases/download/v1.9.0/a",
            "https://example.com/a",
            "https://github.com/youseonghyeon/aster/releases/download/v1.8.0/a",
        ] {
            assert!(!valid_download_url(url, "1.9.0"));
        }
    }
    #[test]
    fn only_release_aster_can_install() {
        assert!(supported("com.yuseonghyeon.aster", false));
        for id in [
            "com.yuseonghyeon.aster.dev",
            "com.yuseonghyeon.aster.preview",
            "other",
        ] {
            assert!(!supported(id, false));
        }
        assert!(!supported("com.yuseonghyeon.aster", true));
    }
    #[test]
    fn concurrent_operations_are_rejected_and_failure_releases_guard() {
        let state = UpdateState::default();
        let guard = state.begin().unwrap();
        assert!(state.begin().is_err());
        drop(guard);
        assert!(state.begin().is_ok());
    }
}
