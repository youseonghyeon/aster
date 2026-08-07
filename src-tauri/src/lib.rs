use std::{fs, path::PathBuf};
use tauri::{
    menu::{Menu, MenuItemBuilder, MenuItemKind, PredefinedMenuItem},
    Emitter,
};

const MAX_MARKDOWN_FILE_SIZE: u64 = 10 * 1024 * 1024;

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct MarkdownDocument {
    path: String,
    name: String,
    content: String,
}

#[tauri::command]
async fn read_markdown_file(path: String) -> Result<MarkdownDocument, String> {
    tauri::async_runtime::spawn_blocking(move || read_markdown_file_from_disk(path))
        .await
        .map_err(|error| format!("파일 읽기 작업을 완료하지 못했습니다: {error}"))?
}

fn read_markdown_file_from_disk(path: String) -> Result<MarkdownDocument, String> {
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

    let content = fs::read_to_string(&canonical_path)
        .map_err(|error| format!("UTF-8 Markdown 파일을 읽을 수 없습니다: {error}"))?;
    let name = canonical_path
        .file_name()
        .and_then(|name| name.to_str())
        .unwrap_or("문서.md")
        .to_owned();

    Ok(MarkdownDocument {
        path: canonical_path.to_string_lossy().into_owned(),
        name,
        content,
    })
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
            let separator = PredefinedMenuItem::separator(app)?;

            for item in menu.items()? {
                if let MenuItemKind::Submenu(submenu) = item {
                    if submenu.text()? == "File" {
                        submenu.prepend_items(&[&open_item, &separator])?;
                        break;
                    }
                }
            }

            Ok(menu)
        })
        .on_menu_event(|app, event| {
            if event.id() == "open_markdown" {
                let _ = app.emit("open-markdown-requested", ());
            }
        })
        .invoke_handler(tauri::generate_handler![read_markdown_file])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
