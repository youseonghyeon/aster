use std::sync::Mutex;
use tauri::{AppHandle, RunEvent, State};
#[cfg(target_os = "macos")]
use tauri::{Emitter, Manager, Url};

#[cfg(target_os = "macos")]
const SYSTEM_OPEN_EVENT: &str = "system-open-requested";

#[derive(Debug, Default)]
pub(crate) struct SystemOpenState {
    pending_path: Mutex<Option<String>>,
}

impl SystemOpenState {
    #[cfg(target_os = "macos")]
    fn replace(&self, path: String) -> bool {
        match self.pending_path.lock() {
            Ok(mut pending) => {
                *pending = Some(path);
                true
            }
            Err(_) => false,
        }
    }

    fn take(&self) -> Result<Option<String>, String> {
        self.pending_path
            .lock()
            .map(|mut pending| pending.take())
            .map_err(|_| "시스템 열기 요청 상태를 사용할 수 없습니다.".to_owned())
    }
}

#[tauri::command]
pub(crate) fn take_system_open_request(
    state: State<'_, SystemOpenState>,
) -> Result<Option<String>, String> {
    state.take()
}

pub(crate) fn handle_run_event(app: &AppHandle, event: RunEvent) {
    #[cfg(target_os = "macos")]
    if let RunEvent::Opened { urls } = event {
        handle_opened_urls(app, &urls);
    }
    #[cfg(not(target_os = "macos"))]
    let _ = (app, event);
}

#[cfg(target_os = "macos")]
fn handle_opened_urls(app: &AppHandle, urls: &[Url]) {
    let Some(path) = latest_file_path(urls) else {
        return;
    };
    if !app.state::<SystemOpenState>().replace(path) {
        return;
    }
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.unminimize();
        let _ = window.set_focus();
    }
    let _ = app.emit(SYSTEM_OPEN_EVENT, ());
}

#[cfg(target_os = "macos")]
fn latest_file_path(urls: &[Url]) -> Option<String> {
    urls.iter().rev().find_map(|url| {
        if url.scheme() != "file" {
            return None;
        }
        let path = url.to_file_path().ok()?;
        let path = path.canonicalize().unwrap_or(path);
        path.into_os_string().into_string().ok()
    })
}

#[cfg(all(test, target_os = "macos"))]
mod tests {
    use super::*;

    fn url(value: &str) -> Url {
        Url::parse(value).unwrap()
    }

    #[test]
    fn keeps_the_latest_file_url_as_a_decoded_path() {
        let urls = [
            url("file:///docs/first.md"),
            url("file:///docs/%ED%95%9C%EA%B8%80%20%EB%AC%B8%EC%84%9C.md"),
        ];
        assert_eq!(
            latest_file_path(&urls).as_deref(),
            Some("/docs/한글 문서.md")
        );
    }

    #[test]
    fn resolves_symbolic_links_to_the_canonical_document_path() {
        let directory = tempfile::tempdir().unwrap();
        let document = directory.path().join("guide.md");
        let link = directory.path().join("link.md");
        std::fs::write(&document, "# guide").unwrap();
        std::os::unix::fs::symlink(&document, &link).unwrap();

        let urls = [Url::from_file_path(&link).unwrap()];
        assert_eq!(
            latest_file_path(&urls),
            Some(
                document
                    .canonicalize()
                    .unwrap()
                    .into_os_string()
                    .into_string()
                    .unwrap()
            )
        );
    }

    #[test]
    fn ignores_non_file_urls() {
        let urls = [
            url("file:///docs/first.md"),
            url("https://example.com/a.md"),
        ];
        assert_eq!(latest_file_path(&urls).as_deref(), Some("/docs/first.md"));
        assert_eq!(latest_file_path(&[url("aster://open")]), None);
        assert_eq!(latest_file_path(&[]), None);
    }

    #[test]
    fn take_returns_the_latest_request_once() {
        let state = SystemOpenState::default();
        assert_eq!(state.take(), Ok(None));
        assert!(state.replace("/docs/first.md".to_owned()));
        assert!(state.replace("/docs/second.md".to_owned()));
        assert_eq!(state.take(), Ok(Some("/docs/second.md".to_owned())));
        assert_eq!(state.take(), Ok(None));
    }
}
