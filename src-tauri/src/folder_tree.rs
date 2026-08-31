use crate::document_io::{self, MarkdownDocument};
use serde::{Deserialize, Serialize};
use std::{
    collections::HashMap,
    fs,
    path::{Component, Path, PathBuf},
    sync::{
        atomic::{AtomicU64, Ordering},
        Arc, Mutex,
    },
};

const MAX_DIRECTORY_DEPTH: usize = 64;
const MAX_DIRECTORY_ENTRIES: usize = 2_000;

#[derive(Clone, Default)]
pub(crate) struct FolderTreeState {
    inner: Arc<FolderTreeInner>,
}

#[derive(Default)]
struct FolderTreeInner {
    next_token: AtomicU64,
    sessions: Mutex<HashMap<u64, PathBuf>>,
}

#[derive(Clone)]
struct FolderSession {
    token: u64,
    root: PathBuf,
}

#[derive(Clone, Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct FolderRoot {
    pub(crate) token: u64,
    pub(crate) path: String,
    pub(crate) name: String,
}

#[derive(Clone, Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) enum FolderEntryKind {
    Directory,
    Markdown,
    Image,
}

#[derive(Clone, Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct FolderEntry {
    pub(crate) name: String,
    pub(crate) relative_path: String,
    pub(crate) path: String,
    pub(crate) kind: FolderEntryKind,
}

#[derive(Clone, Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct FolderListing {
    pub(crate) root_token: u64,
    pub(crate) directory: String,
    pub(crate) entries: Vec<FolderEntry>,
    pub(crate) truncated: bool,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ListFolderChildrenRequest {
    pub(crate) root_token: u64,
    pub(crate) relative_path: String,
}

impl FolderTreeState {
    pub(crate) fn open_folder(&self, requested_path: String) -> Result<FolderRoot, String> {
        let root = PathBuf::from(&requested_path)
            .canonicalize()
            .map_err(|error| format!("폴더 경로를 확인할 수 없습니다: {error}"))?;
        let metadata = fs::metadata(&root)
            .map_err(|error| format!("폴더 정보를 읽을 수 없습니다: {error}"))?;
        if !metadata.is_dir() {
            return Err("선택한 경로가 폴더가 아닙니다.".into());
        }
        let name = root
            .file_name()
            .and_then(|name| name.to_str())
            .filter(|name| !name.is_empty())
            .unwrap_or_else(|| root.to_str().unwrap_or("폴더"))
            .to_owned();
        let token = self
            .inner
            .next_token
            .fetch_add(1, Ordering::Relaxed)
            .saturating_add(1);
        self.inner
            .sessions
            .lock()
            .map_err(|_| "폴더 탐색 상태를 사용할 수 없습니다.".to_owned())?
            .insert(token, root.clone());
        Ok(FolderRoot {
            token,
            path: root.to_string_lossy().into_owned(),
            name,
        })
    }

    pub(crate) fn close_folder(&self, root_token: Option<u64>) -> Result<(), String> {
        let mut sessions = self
            .inner
            .sessions
            .lock()
            .map_err(|_| "폴더 탐색 상태를 사용할 수 없습니다.".to_owned())?;
        if let Some(token) = root_token {
            sessions.remove(&token);
        } else {
            sessions.clear();
        }
        Ok(())
    }

    pub(crate) fn list_children(
        &self,
        request: ListFolderChildrenRequest,
    ) -> Result<FolderListing, String> {
        let session = self.current_session(request.root_token)?;
        let relative = validate_relative_directory(&request.relative_path)?;
        let directory = resolve_directory(&session.root, &relative)?;
        let mut entries = Vec::new();
        let mut truncated = false;
        let children = fs::read_dir(&directory)
            .map_err(|error| format!("폴더 내용을 읽을 수 없습니다: {error}"))?;

        for child in children {
            let child = match child {
                Ok(child) => child,
                Err(_) => continue,
            };
            let Some(name) = child.file_name().to_str().map(str::to_owned) else {
                continue;
            };
            if name.starts_with('.') {
                continue;
            }
            let metadata = match fs::symlink_metadata(child.path()) {
                Ok(metadata) if !metadata.file_type().is_symlink() => metadata,
                _ => continue,
            };
            let kind = if metadata.is_dir() {
                FolderEntryKind::Directory
            } else if metadata.is_file() {
                match supported_file_kind(&child.path()) {
                    Some(kind) => kind,
                    None => continue,
                }
            } else {
                continue;
            };
            if entries.len() == MAX_DIRECTORY_ENTRIES {
                truncated = true;
                break;
            }
            let child_relative = relative.join(&name);
            let relative_path = relative_path_string(&child_relative)?;
            entries.push(FolderEntry {
                name,
                relative_path,
                path: child.path().to_string_lossy().into_owned(),
                kind,
            });
        }

        entries.sort_by(|left, right| {
            entry_sort_rank(&left.kind)
                .cmp(&entry_sort_rank(&right.kind))
                .then_with(|| left.name.to_lowercase().cmp(&right.name.to_lowercase()))
                .then_with(|| left.name.cmp(&right.name))
        });

        Ok(FolderListing {
            root_token: session.token,
            directory: relative_path_string(&relative)?,
            entries,
            truncated,
        })
    }

    pub(crate) fn resolve_image(
        &self,
        root_token: u64,
        relative_path: String,
    ) -> Result<PathBuf, String> {
        let session = self.current_session(root_token)?;
        let relative = validate_relative_file(&relative_path)?;
        let path = session.root.join(relative);
        let metadata = fs::symlink_metadata(&path)
            .map_err(|error| format!("이미지 정보를 읽을 수 없습니다: {error}"))?;
        if metadata.file_type().is_symlink() || !metadata.is_file() {
            return Err("선택한 이미지 파일을 열 수 없습니다.".into());
        }
        let canonical = path
            .canonicalize()
            .map_err(|error| format!("이미지 경로를 확인할 수 없습니다: {error}"))?;
        if canonical != path
            || !canonical.starts_with(&session.root)
            || supported_file_kind(&canonical) != Some(FolderEntryKind::Image)
        {
            return Err("선택한 이미지가 현재 폴더 안에 있지 않습니다.".into());
        }
        Ok(canonical)
    }

    pub(crate) fn read_markdown(
        &self,
        root_path: String,
        relative_path: String,
    ) -> Result<MarkdownDocument, String> {
        let expected_root = PathBuf::from(&root_path);
        let root_metadata = fs::symlink_metadata(&expected_root)
            .map_err(|error| format!("Markdown 루트 정보를 읽을 수 없습니다: {error}"))?;
        if root_metadata.file_type().is_symlink() || !root_metadata.is_dir() {
            return Err("Markdown 루트가 더 이상 안전한 폴더가 아닙니다.".into());
        }
        let root = expected_root
            .canonicalize()
            .map_err(|error| format!("Markdown 루트를 확인할 수 없습니다: {error}"))?;
        if root != expected_root {
            return Err("Markdown 루트의 위치가 변경되어 파일을 사용할 수 없습니다.".into());
        }
        let relative = validate_relative_file(&relative_path)?;
        let path = root.join(relative);
        let metadata = fs::symlink_metadata(&path)
            .map_err(|error| format!("Markdown 파일 정보를 읽을 수 없습니다: {error}"))?;
        if metadata.file_type().is_symlink() || !metadata.is_file() {
            return Err("선택한 Markdown 파일을 열 수 없습니다.".into());
        }
        let canonical = path
            .canonicalize()
            .map_err(|error| format!("Markdown 경로를 확인할 수 없습니다: {error}"))?;
        if canonical != path
            || !canonical.starts_with(&root)
            || supported_file_kind(&canonical) != Some(FolderEntryKind::Markdown)
        {
            return Err("선택한 Markdown 파일이 현재 폴더 안에 있지 않습니다.".into());
        }
        document_io::read_markdown_file_from_disk(canonical.to_string_lossy().into_owned())
    }

    pub(crate) fn remove_file(&self, root_token: u64, relative_path: String) -> Result<(), String> {
        let session = self.current_session(root_token)?;
        let relative = validate_relative_file(&relative_path)?;
        if relative.components().any(|component| match component {
            Component::Normal(name) => name.to_string_lossy().starts_with('.'),
            _ => false,
        }) {
            return Err("숨김 파일은 폴더 탐색기에서 제거할 수 없습니다.".into());
        }
        let path = session.root.join(relative);
        let metadata = fs::symlink_metadata(&path)
            .map_err(|error| format!("파일 정보를 읽을 수 없습니다: {error}"))?;
        if metadata.file_type().is_symlink() || !metadata.is_file() {
            return Err("선택한 항목은 제거할 수 있는 파일이 아닙니다.".into());
        }
        if supported_file_kind(&path).is_none() {
            return Err("지원하는 Markdown이나 이미지 파일만 제거할 수 있습니다.".into());
        }
        let canonical = path
            .canonicalize()
            .map_err(|error| format!("파일 경로를 확인할 수 없습니다: {error}"))?;
        if canonical != path || !canonical.starts_with(&session.root) {
            return Err("선택한 파일이 현재 폴더 안에 있지 않습니다.".into());
        }
        fs::remove_file(&canonical).map_err(|error| format!("파일을 제거할 수 없습니다: {error}"))
    }

    fn current_session(&self, token: u64) -> Result<FolderSession, String> {
        let sessions = self
            .inner
            .sessions
            .lock()
            .map_err(|_| "폴더 탐색 상태를 사용할 수 없습니다.".to_owned())?;
        sessions
            .get(&token)
            .cloned()
            .map(|root| FolderSession { token, root })
            .ok_or_else(|| "폴더 탐색 세션이 변경되었습니다. 다시 시도해 주세요.".into())
    }
}

fn validate_relative_directory(path: &str) -> Result<PathBuf, String> {
    if path.is_empty() {
        return Ok(PathBuf::new());
    }
    validate_relative_path(path)
}

fn validate_relative_file(path: &str) -> Result<PathBuf, String> {
    let relative = validate_relative_path(path)?;
    if relative.as_os_str().is_empty() {
        return Err("파일 경로가 비어 있습니다.".into());
    }
    Ok(relative)
}

fn validate_relative_path(path: &str) -> Result<PathBuf, String> {
    let relative = PathBuf::from(path);
    if relative.is_absolute() {
        return Err("절대 경로는 사용할 수 없습니다.".into());
    }
    let mut depth = 0;
    for component in relative.components() {
        match component {
            Component::Normal(_) => depth += 1,
            _ => return Err("현재 폴더 밖의 경로는 사용할 수 없습니다.".into()),
        }
    }
    if depth > MAX_DIRECTORY_DEPTH {
        return Err("폴더 깊이가 탐색 한도를 초과했습니다.".into());
    }
    Ok(relative)
}

fn resolve_directory(root: &Path, relative: &Path) -> Result<PathBuf, String> {
    let requested = root.join(relative);
    let metadata = fs::symlink_metadata(&requested)
        .map_err(|error| format!("폴더 정보를 읽을 수 없습니다: {error}"))?;
    if metadata.file_type().is_symlink() || !metadata.is_dir() {
        return Err("선택한 경로가 탐색 가능한 폴더가 아닙니다.".into());
    }
    let canonical = requested
        .canonicalize()
        .map_err(|error| format!("폴더 경로를 확인할 수 없습니다: {error}"))?;
    if canonical != requested || !canonical.starts_with(root) {
        return Err("현재 폴더 밖의 경로는 탐색할 수 없습니다.".into());
    }
    Ok(canonical)
}

fn supported_file_kind(path: &Path) -> Option<FolderEntryKind> {
    let extension = path.extension()?.to_str()?.to_ascii_lowercase();
    match extension.as_str() {
        "md" | "markdown" => Some(FolderEntryKind::Markdown),
        "png" | "jpg" | "jpeg" | "gif" | "webp" | "svg" => Some(FolderEntryKind::Image),
        _ => None,
    }
}

fn entry_sort_rank(kind: &FolderEntryKind) -> u8 {
    match kind {
        FolderEntryKind::Directory => 0,
        FolderEntryKind::Markdown => 1,
        FolderEntryKind::Image => 2,
    }
}

fn relative_path_string(path: &Path) -> Result<String, String> {
    path.to_str()
        .map(|path| path.replace(std::path::MAIN_SEPARATOR, "/"))
        .ok_or_else(|| "UTF-8로 표현할 수 없는 경로는 탐색할 수 없습니다.".to_owned())
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    fn open_test_root(directory: &TempDir) -> (FolderTreeState, FolderRoot) {
        let state = FolderTreeState::default();
        let root = state
            .open_folder(directory.path().to_string_lossy().into_owned())
            .unwrap();
        (state, root)
    }

    #[test]
    fn filters_hidden_unsupported_and_sorts_supported_entries() {
        let directory = TempDir::new().unwrap();
        fs::create_dir(directory.path().join("guide")).unwrap();
        fs::write(directory.path().join("B.md"), "# B").unwrap();
        fs::write(directory.path().join("a.markdown"), "# A").unwrap();
        fs::write(directory.path().join("cover.PNG"), []).unwrap();
        fs::write(directory.path().join("notes.txt"), "ignored").unwrap();
        fs::write(directory.path().join(".private.md"), "ignored").unwrap();
        let (state, root) = open_test_root(&directory);

        let listing = state
            .list_children(ListFolderChildrenRequest {
                root_token: root.token,
                relative_path: String::new(),
            })
            .unwrap();

        assert_eq!(
            listing
                .entries
                .iter()
                .map(|entry| (&entry.name, &entry.kind))
                .collect::<Vec<_>>(),
            vec![
                (&"guide".to_owned(), &FolderEntryKind::Directory),
                (&"a.markdown".to_owned(), &FolderEntryKind::Markdown),
                (&"B.md".to_owned(), &FolderEntryKind::Markdown),
                (&"cover.PNG".to_owned(), &FolderEntryKind::Image),
            ]
        );
    }

    #[test]
    fn lists_only_the_requested_directory_level() {
        let directory = TempDir::new().unwrap();
        let nested = directory.path().join("guide");
        fs::create_dir(&nested).unwrap();
        fs::write(nested.join("start.md"), "# Start").unwrap();
        let (state, root) = open_test_root(&directory);

        let root_listing = state
            .list_children(ListFolderChildrenRequest {
                root_token: root.token,
                relative_path: String::new(),
            })
            .unwrap();
        let nested_listing = state
            .list_children(ListFolderChildrenRequest {
                root_token: root.token,
                relative_path: "guide".into(),
            })
            .unwrap();

        assert_eq!(root_listing.entries.len(), 1);
        assert_eq!(nested_listing.entries[0].relative_path, "guide/start.md");
    }

    #[test]
    fn removes_only_supported_files_from_the_current_folder_session() {
        let directory = TempDir::new().unwrap();
        fs::create_dir(directory.path().join("guide")).unwrap();
        let markdown = directory.path().join("guide/start.md");
        let image = directory.path().join("cover.png");
        fs::write(&markdown, "# Start").unwrap();
        fs::write(&image, []).unwrap();
        let (state, root) = open_test_root(&directory);

        state
            .remove_file(root.token, "guide/start.md".into())
            .unwrap();
        state.remove_file(root.token, "cover.png".into()).unwrap();

        assert!(!markdown.exists());
        assert!(!image.exists());
        assert!(directory.path().join("guide").is_dir());
    }

    #[test]
    fn refuses_directory_unsupported_outside_and_closed_session_removal() {
        let directory = TempDir::new().unwrap();
        fs::create_dir(directory.path().join("guide")).unwrap();
        fs::write(directory.path().join("notes.txt"), "keep").unwrap();
        fs::write(directory.path().join(".private.md"), "keep").unwrap();
        fs::write(directory.path().join("keep.md"), "# Keep").unwrap();
        let (state, root) = open_test_root(&directory);

        assert!(state.remove_file(root.token, "guide".into()).is_err());
        assert!(state.remove_file(root.token, "notes.txt".into()).is_err());
        assert!(state.remove_file(root.token, ".private.md".into()).is_err());
        assert!(state
            .remove_file(root.token, "../outside.md".into())
            .is_err());
        assert!(state
            .remove_file(root.token, "/tmp/outside.md".into())
            .is_err());
        state.close_folder(Some(root.token)).unwrap();
        assert!(state.remove_file(root.token, "keep.md".into()).is_err());

        assert!(directory.path().join("guide").is_dir());
        assert!(directory.path().join("notes.txt").is_file());
        assert!(directory.path().join(".private.md").is_file());
        assert!(directory.path().join("keep.md").is_file());
    }

    #[test]
    fn rejects_escape_absolute_and_closed_session_paths() {
        let first = TempDir::new().unwrap();
        let second = TempDir::new().unwrap();
        let (state, first_root) = open_test_root(&first);

        assert!(state
            .list_children(ListFolderChildrenRequest {
                root_token: first_root.token,
                relative_path: "../outside".into(),
            })
            .is_err());
        assert!(state
            .list_children(ListFolderChildrenRequest {
                root_token: first_root.token,
                relative_path: "/tmp".into(),
            })
            .is_err());

        let second_root = state
            .open_folder(second.path().to_string_lossy().into_owned())
            .unwrap();
        assert!(state
            .list_children(ListFolderChildrenRequest {
                root_token: first_root.token,
                relative_path: String::new(),
            })
            .is_ok());
        state.close_folder(Some(first_root.token)).unwrap();
        assert!(state
            .list_children(ListFolderChildrenRequest {
                root_token: first_root.token,
                relative_path: String::new(),
            })
            .is_err());
        assert!(state
            .list_children(ListFolderChildrenRequest {
                root_token: second_root.token,
                relative_path: String::new(),
            })
            .is_ok());
    }

    #[cfg(unix)]
    #[test]
    fn does_not_list_or_traverse_symbolic_links() {
        use std::os::unix::fs::symlink;

        let directory = TempDir::new().unwrap();
        let outside = TempDir::new().unwrap();
        fs::write(outside.path().join("outside.md"), "# Outside").unwrap();
        symlink(outside.path(), directory.path().join("linked")).unwrap();
        let (state, root) = open_test_root(&directory);

        let listing = state
            .list_children(ListFolderChildrenRequest {
                root_token: root.token,
                relative_path: String::new(),
            })
            .unwrap();
        assert!(listing.entries.is_empty());
        assert!(state
            .list_children(ListFolderChildrenRequest {
                root_token: root.token,
                relative_path: "linked".into(),
            })
            .is_err());

        let linked_file = directory.path().join("linked-file.md");
        symlink(outside.path().join("outside.md"), &linked_file).unwrap();
        assert!(state
            .remove_file(root.token, "linked-file.md".into())
            .is_err());
        assert!(linked_file
            .symlink_metadata()
            .unwrap()
            .file_type()
            .is_symlink());
        assert!(outside.path().join("outside.md").is_file());

        let markdown = directory.path().join("replaced.md");
        fs::write(&markdown, "# Before").unwrap();
        let listing = state
            .list_children(ListFolderChildrenRequest {
                root_token: root.token,
                relative_path: String::new(),
            })
            .unwrap();
        assert!(listing
            .entries
            .iter()
            .any(|entry| entry.relative_path == "replaced.md"));
        fs::remove_file(&markdown).unwrap();
        symlink(outside.path().join("outside.md"), &markdown).unwrap();
        assert!(state
            .read_markdown(root.path, "replaced.md".into())
            .is_err());
    }

    #[cfg(unix)]
    #[test]
    fn rejects_a_root_reached_through_a_replaced_parent_symlink() {
        use std::os::unix::fs::symlink;

        let workspace = TempDir::new().unwrap();
        let original_parent = workspace.path().join("parent");
        let original_root = original_parent.join("root");
        fs::create_dir_all(&original_root).unwrap();
        fs::write(original_root.join("document.md"), "# Original").unwrap();
        let state = FolderTreeState::default();
        let root = state
            .open_folder(original_root.to_string_lossy().into_owned())
            .unwrap();

        let moved_parent = workspace.path().join("moved-parent");
        fs::rename(&original_parent, &moved_parent).unwrap();
        let outside_parent = workspace.path().join("outside-parent");
        let outside_root = outside_parent.join("root");
        fs::create_dir_all(&outside_root).unwrap();
        fs::write(outside_root.join("document.md"), "# Outside").unwrap();
        symlink(&outside_parent, &original_parent).unwrap();

        assert!(state
            .read_markdown(root.path, "document.md".into())
            .is_err());
    }

    #[cfg(unix)]
    #[test]
    fn rejects_a_file_reached_through_a_replaced_internal_directory_symlink() {
        use std::os::unix::fs::symlink;

        let directory = TempDir::new().unwrap();
        let first = directory.path().join("first");
        let second = directory.path().join("second");
        fs::create_dir_all(&first).unwrap();
        fs::create_dir_all(&second).unwrap();
        fs::write(first.join("document.md"), "# First").unwrap();
        fs::write(second.join("document.md"), "# Second").unwrap();
        let (state, root) = open_test_root(&directory);

        let listing = state
            .list_children(ListFolderChildrenRequest {
                root_token: root.token,
                relative_path: "first".into(),
            })
            .unwrap();
        assert_eq!(listing.entries[0].relative_path, "first/document.md");

        fs::rename(&first, directory.path().join("moved-first")).unwrap();
        symlink(&second, &first).unwrap();

        assert!(state
            .read_markdown(root.path, "first/document.md".into())
            .is_err());
    }
}
