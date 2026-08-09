use std::{fs, path::PathBuf, time::UNIX_EPOCH};
use tauri::{
    menu::{Menu, MenuItemBuilder, MenuItemKind, PredefinedMenuItem},
    Emitter,
};

const MAX_MARKDOWN_FILE_SIZE: u64 = 10 * 1024 * 1024;

#[derive(Debug, serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct MarkdownDocument {
    path: String,
    name: String,
    content: String,
    revision: String,
}

#[derive(Debug, serde::Serialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
enum MarkdownFileStatus {
    Available { revision: String },
    Unavailable { message: String },
}

#[tauri::command]
async fn read_markdown_file(path: String) -> Result<MarkdownDocument, String> {
    tauri::async_runtime::spawn_blocking(move || read_markdown_file_from_disk(path))
        .await
        .map_err(|error| format!("파일 읽기 작업을 완료하지 못했습니다: {error}"))?
}

#[tauri::command]
async fn get_markdown_file_status(path: String) -> Result<MarkdownFileStatus, String> {
    tauri::async_runtime::spawn_blocking(move || get_markdown_file_status_from_disk(path))
        .await
        .map_err(|error| format!("파일 상태 확인 작업을 완료하지 못했습니다: {error}"))
}

fn read_markdown_file_from_disk(path: String) -> Result<MarkdownDocument, String> {
    for _ in 0..2 {
        let (canonical_path, metadata) = validate_markdown_file(&path)?;
        let revision_before_read = get_file_revision(&metadata)?;
        let content = fs::read_to_string(&canonical_path)
            .map_err(|error| format!("UTF-8 Markdown 파일을 읽을 수 없습니다: {error}"))?;
        let metadata_after_read = fs::metadata(&canonical_path)
            .map_err(|error| format!("파일 정보를 다시 확인할 수 없습니다: {error}"))?;
        let revision_after_read = get_file_revision(&metadata_after_read)?;

        if revision_before_read != revision_after_read {
            continue;
        }

        let name = canonical_path
            .file_name()
            .and_then(|name| name.to_str())
            .unwrap_or("문서.md")
            .to_owned();

        return Ok(MarkdownDocument {
            path: canonical_path.to_string_lossy().into_owned(),
            name,
            content,
            revision: revision_after_read,
        });
    }

    Err("파일을 읽는 동안 내용이 계속 변경되었습니다. 잠시 후 다시 시도해 주세요.".into())
}

fn get_markdown_file_status_from_disk(path: String) -> MarkdownFileStatus {
    match validate_markdown_file(&path).and_then(|(_, metadata)| get_file_revision(&metadata)) {
        Ok(revision) => MarkdownFileStatus::Available { revision },
        Err(message) => MarkdownFileStatus::Unavailable { message },
    }
}

fn validate_markdown_file(path: &str) -> Result<(PathBuf, fs::Metadata), String> {
    let path = PathBuf::from(path);
    let extension = path
        .extension()
        .and_then(|extension| extension.to_str())
        .map(str::to_ascii_lowercase);

    if !matches!(extension.as_deref(), Some("md" | "markdown")) {
        return Err("Markdown 파일(.md 또는 .markdown)만 열 수 있습니다.".into());
    }

    let canonical_path = path
        .canonicalize()
        .map_err(|error| format!("파일 경로를 확인할 수 없습니다: {error}"))?;
    let metadata = fs::metadata(&canonical_path)
        .map_err(|error| format!("파일 정보를 읽을 수 없습니다: {error}"))?;

    if !metadata.is_file() {
        return Err("선택한 경로가 파일이 아닙니다.".into());
    }

    if metadata.len() > MAX_MARKDOWN_FILE_SIZE {
        return Err("10MB보다 큰 Markdown 파일은 열 수 없습니다.".into());
    }

    Ok((canonical_path, metadata))
}

fn get_file_revision(metadata: &fs::Metadata) -> Result<String, String> {
    let modified_at = metadata
        .modified()
        .map_err(|error| format!("파일 수정 시각을 확인할 수 없습니다: {error}"))?;
    let modified_key = match modified_at.duration_since(UNIX_EPOCH) {
        Ok(duration) => format!("{}:{:09}", duration.as_secs(), duration.subsec_nanos()),
        Err(error) => {
            let duration = error.duration();
            format!("-{}:{:09}", duration.as_secs(), duration.subsec_nanos())
        }
    };

    Ok(format!("{modified_key}:{}", metadata.len()))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .menu(|app| {
            let menu = Menu::default(app)?;
            let open_item = MenuItemBuilder::with_id("open_markdown", "Open…")
                .accelerator("CmdOrCtrl+O")
                .build(app)?;
            let file_separator = PredefinedMenuItem::separator(app)?;
            let zoom_in_item = MenuItemBuilder::with_id("zoom_in", "Zoom In")
                .accelerator("CmdOrCtrl+=")
                .build(app)?;
            let zoom_out_item = MenuItemBuilder::with_id("zoom_out", "Zoom Out")
                .accelerator("CmdOrCtrl+-")
                .build(app)?;
            let actual_size_item = MenuItemBuilder::with_id("actual_size", "Actual Size")
                .accelerator("CmdOrCtrl+0")
                .build(app)?;
            let view_separator = PredefinedMenuItem::separator(app)?;

            for item in menu.items()? {
                if let MenuItemKind::Submenu(submenu) = item {
                    match submenu.text()?.as_str() {
                        "File" => {
                            submenu.prepend_items(&[&open_item, &file_separator])?;
                        }
                        "View" => {
                            submenu.prepend_items(&[
                                &zoom_in_item,
                                &zoom_out_item,
                                &actual_size_item,
                                &view_separator,
                            ])?;
                        }
                        _ => {}
                    }
                }
            }

            Ok(menu)
        })
        .on_menu_event(|app, event| match event.id().as_ref() {
            "open_markdown" => {
                let _ = app.emit("open-markdown-requested", ());
            }
            "zoom_in" => {
                let _ = app.emit("reading-zoom-requested", "in");
            }
            "zoom_out" => {
                let _ = app.emit("reading-zoom-requested", "out");
            }
            "actual_size" => {
                let _ = app.emit("reading-zoom-requested", "reset");
            }
            _ => {}
        })
        .invoke_handler(tauri::generate_handler![
            read_markdown_file,
            get_markdown_file_status
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::{
        io::Write,
        sync::atomic::{AtomicU64, Ordering},
    };

    static NEXT_TEST_ID: AtomicU64 = AtomicU64::new(0);

    struct TestFile {
        path: PathBuf,
    }

    impl TestFile {
        fn new(extension: &str, content: &[u8]) -> Self {
            let id = NEXT_TEST_ID.fetch_add(1, Ordering::Relaxed);
            let path = std::env::temp_dir().join(format!(
                "aster-file-status-{}-{id}.{extension}",
                std::process::id()
            ));
            fs::write(&path, content).expect("test file should be written");
            Self { path }
        }

        fn path_string(&self) -> String {
            self.path.to_string_lossy().into_owned()
        }
    }

    impl Drop for TestFile {
        fn drop(&mut self) {
            let _ = fs::remove_file(&self.path);
        }
    }

    fn available_revision(status: MarkdownFileStatus) -> String {
        match status {
            MarkdownFileStatus::Available { revision } => revision,
            MarkdownFileStatus::Unavailable { message } => {
                panic!("expected available file, got: {message}")
            }
        }
    }

    #[test]
    fn reads_valid_markdown_with_matching_revision() {
        let file = TestFile::new("md", "# 처음\n".as_bytes());

        let document = read_markdown_file_from_disk(file.path_string()).unwrap();
        let status = get_markdown_file_status_from_disk(file.path_string());

        assert_eq!(document.content, "# 처음\n");
        assert_eq!(document.revision, available_revision(status));
        assert!(document
            .path
            .ends_with(&file.path.to_string_lossy().as_ref()));
    }

    #[test]
    fn reports_change_deletion_and_recovery() {
        let file = TestFile::new("markdown", "# 처음\n".as_bytes());
        let first_revision =
            available_revision(get_markdown_file_status_from_disk(file.path_string()));

        fs::write(&file.path, "# 외부에서 더 길게 변경됨\n").unwrap();
        let changed_revision =
            available_revision(get_markdown_file_status_from_disk(file.path_string()));
        assert_ne!(first_revision, changed_revision);

        fs::remove_file(&file.path).unwrap();
        assert!(matches!(
            get_markdown_file_status_from_disk(file.path_string()),
            MarkdownFileStatus::Unavailable { .. }
        ));

        fs::write(&file.path, "# 복구된 문서의 새 내용\n").unwrap();
        let recovered_revision =
            available_revision(get_markdown_file_status_from_disk(file.path_string()));
        assert_ne!(changed_revision, recovered_revision);
    }

    #[test]
    fn preserves_existing_file_validation() {
        let wrong_extension = TestFile::new("txt", b"# markdown\n");
        assert!(read_markdown_file_from_disk(wrong_extension.path_string())
            .unwrap_err()
            .contains("Markdown 파일"));

        let invalid_utf8 = TestFile::new("MD", &[0xff, 0xfe]);
        assert!(read_markdown_file_from_disk(invalid_utf8.path_string())
            .unwrap_err()
            .contains("UTF-8"));

        let oversized = TestFile::new("md", b"");
        let mut oversized_file = fs::OpenOptions::new()
            .write(true)
            .open(&oversized.path)
            .unwrap();
        oversized_file
            .write_all(&vec![0; (MAX_MARKDOWN_FILE_SIZE + 1) as usize])
            .unwrap();
        assert!(read_markdown_file_from_disk(oversized.path_string())
            .unwrap_err()
            .contains("10MB"));
    }
}
