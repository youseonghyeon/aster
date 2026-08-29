use crate::document_io::validate_existing_markdown_file;
use notify::{RecommendedWatcher, RecursiveMode, Watcher};
use serde::Serialize;
use std::{
    path::Path,
    sync::{
        atomic::{AtomicU64, Ordering},
        Mutex,
    },
};
use tauri::{AppHandle, Emitter};

pub(crate) struct FileWatchState {
    next_token: AtomicU64,
    session: Mutex<Option<FileWatchSession>>,
}

struct FileWatchSession {
    #[allow(dead_code)]
    watcher: RecommendedWatcher,
    token: u64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct WatchRegistration {
    pub(crate) token: u64,
    pub(crate) path: String,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct MarkdownFileChanged {
    token: u64,
    path: String,
}

impl Default for FileWatchState {
    fn default() -> Self {
        Self {
            next_token: AtomicU64::new(0),
            session: Mutex::new(None),
        }
    }
}

pub(crate) fn watch_markdown_file(
    app: AppHandle,
    state: &FileWatchState,
    path: String,
) -> Result<WatchRegistration, String> {
    let (canonical_path, _) = validate_existing_markdown_file(&path)?;
    let parent = canonical_path
        .parent()
        .ok_or_else(|| "감시할 폴더를 확인할 수 없습니다.".to_owned())?
        .to_owned();
    let token = state.next_token.fetch_add(1, Ordering::Relaxed) + 1;
    let event_path = canonical_path.clone();
    let event_path_string = canonical_path.to_string_lossy().into_owned();
    let mut watcher = notify::recommended_watcher(move |result: notify::Result<notify::Event>| {
        let Ok(event) = result else {
            return;
        };
        if event
            .paths
            .iter()
            .any(|changed| path_matches(changed, &event_path))
        {
            let _ = app.emit(
                "markdown-file-changed",
                MarkdownFileChanged {
                    token,
                    path: event_path_string.clone(),
                },
            );
        }
    })
    .map_err(|error| format!("파일 감시를 시작할 수 없습니다: {error}"))?;
    watcher
        .watch(&parent, RecursiveMode::NonRecursive)
        .map_err(|error| format!("문서 폴더를 감시할 수 없습니다: {error}"))?;

    let mut session = state
        .session
        .lock()
        .map_err(|_| "파일 감시 상태를 사용할 수 없습니다.".to_owned())?;
    *session = Some(FileWatchSession { watcher, token });
    Ok(WatchRegistration {
        token,
        path: canonical_path.to_string_lossy().into_owned(),
    })
}

pub(crate) fn unwatch_markdown_file(
    state: &FileWatchState,
    token: Option<u64>,
) -> Result<(), String> {
    let mut session = state
        .session
        .lock()
        .map_err(|_| "파일 감시 상태를 사용할 수 없습니다.".to_owned())?;
    if token.is_none() || session.as_ref().map(|current| current.token) == token {
        *session = None;
    }
    Ok(())
}

fn path_matches(changed: &Path, target: &Path) -> bool {
    changed == target
        || (changed.file_name() == target.file_name() && changed.parent() == target.parent())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn only_matches_the_exact_target_in_a_watched_directory() {
        let target = Path::new("/docs/current.md");
        assert!(path_matches(Path::new("/docs/current.md"), target));
        assert!(!path_matches(Path::new("/docs/other.md"), target));
        assert!(!path_matches(Path::new("/other/current.md"), target));
    }
}
