mod close_guard;
mod document_io;
mod file_watch;
mod folder_tree;
mod recovery;

use close_guard::{CloseGuardState, ResolveCloseRequest};
use document_io::{MarkdownDocument, MarkdownFileStatus, SaveMarkdownRequest, SaveMarkdownResult};
use file_watch::{FileWatchState, WatchRegistration};
use folder_tree::{FolderListing, FolderRoot, FolderTreeState, ListFolderChildrenRequest};
use recovery::{
    DeleteRecoveryDraftRequest, RecoveryDraft, RecoveryState, SaveRecoveryDraftRequest,
};
use tauri::{
    menu::{Menu, MenuItemBuilder, MenuItemKind, PredefinedMenuItem},
    AppHandle, Emitter, Manager, State, Window,
};
use tauri_plugin_opener::OpenerExt;

#[tauri::command]
async fn read_markdown_file(path: String) -> Result<MarkdownDocument, String> {
    tauri::async_runtime::spawn_blocking(move || document_io::read_markdown_file_from_disk(path))
        .await
        .map_err(|error| format!("파일 읽기 작업을 완료하지 못했습니다: {error}"))?
}

#[tauri::command]
async fn get_markdown_file_status(path: String) -> Result<MarkdownFileStatus, String> {
    tauri::async_runtime::spawn_blocking(move || {
        document_io::get_markdown_file_status_from_disk(path)
    })
    .await
    .map_err(|error| format!("파일 상태 확인 작업을 완료하지 못했습니다: {error}"))
}

#[tauri::command]
async fn save_markdown_file(request: SaveMarkdownRequest) -> Result<SaveMarkdownResult, String> {
    tauri::async_runtime::spawn_blocking(move || document_io::save_markdown_file_to_disk(request))
        .await
        .map_err(|error| format!("파일 저장 작업을 완료하지 못했습니다: {error}"))?
}

#[tauri::command]
async fn open_folder(
    state: State<'_, FolderTreeState>,
    path: String,
) -> Result<FolderRoot, String> {
    let state = state.inner().clone();
    tauri::async_runtime::spawn_blocking(move || state.open_folder(path))
        .await
        .map_err(|error| format!("폴더 열기 작업을 완료하지 못했습니다: {error}"))?
}

#[tauri::command]
async fn list_folder_children(
    state: State<'_, FolderTreeState>,
    request: ListFolderChildrenRequest,
) -> Result<FolderListing, String> {
    let state = state.inner().clone();
    tauri::async_runtime::spawn_blocking(move || state.list_children(request))
        .await
        .map_err(|error| format!("폴더 읽기 작업을 완료하지 못했습니다: {error}"))?
}

#[tauri::command]
fn close_folder(state: State<'_, FolderTreeState>, root_token: Option<u64>) -> Result<(), String> {
    state.close_folder(root_token)
}

#[tauri::command]
async fn open_folder_image(
    app: AppHandle,
    state: State<'_, FolderTreeState>,
    root_token: u64,
    relative_path: String,
) -> Result<(), String> {
    let state = state.inner().clone();
    let path = tauri::async_runtime::spawn_blocking(move || {
        state.resolve_image(root_token, relative_path)
    })
    .await
    .map_err(|error| format!("이미지 확인 작업을 완료하지 못했습니다: {error}"))??;
    app.opener()
        .open_path(path.to_string_lossy(), None::<&str>)
        .map_err(|error| format!("이미지를 기본 앱으로 열 수 없습니다: {error}"))
}

#[tauri::command]
async fn read_folder_markdown(
    state: State<'_, FolderTreeState>,
    root_path: String,
    relative_path: String,
) -> Result<MarkdownDocument, String> {
    let state = state.inner().clone();
    tauri::async_runtime::spawn_blocking(move || state.read_markdown(root_path, relative_path))
        .await
        .map_err(|error| format!("Markdown 읽기 작업을 완료하지 못했습니다: {error}"))?
}

#[tauri::command]
fn watch_markdown_file(
    app: AppHandle,
    state: State<'_, FileWatchState>,
    path: String,
) -> Result<WatchRegistration, String> {
    file_watch::watch_markdown_file(app, &state, path)
}

#[tauri::command]
fn unwatch_markdown_file(
    state: State<'_, FileWatchState>,
    token: Option<u64>,
) -> Result<(), String> {
    file_watch::unwatch_markdown_file(&state, token)
}

#[tauri::command]
async fn save_recovery_draft(
    app: AppHandle,
    request: SaveRecoveryDraftRequest,
) -> Result<bool, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let root = app
            .path()
            .app_data_dir()
            .map(recovery::recovery_root)
            .map_err(|error| format!("앱 데이터 폴더를 확인할 수 없습니다: {error}"))?;
        recovery::save_recovery_draft_in(&root, &app.state::<RecoveryState>(), request)
    })
    .await
    .map_err(|error| format!("복구 초안 저장 작업을 완료하지 못했습니다: {error}"))?
}

#[tauri::command]
async fn load_recovery_draft(
    app: AppHandle,
    identity: String,
) -> Result<Option<RecoveryDraft>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let root = app
            .path()
            .app_data_dir()
            .map(recovery::recovery_root)
            .map_err(|error| format!("앱 데이터 폴더를 확인할 수 없습니다: {error}"))?;
        recovery::load_recovery_draft_in(&root, &app.state::<RecoveryState>(), &identity)
    })
    .await
    .map_err(|error| format!("복구 초안 읽기 작업을 완료하지 못했습니다: {error}"))?
}

#[tauri::command]
async fn delete_recovery_draft(
    app: AppHandle,
    request: DeleteRecoveryDraftRequest,
) -> Result<bool, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let root = app
            .path()
            .app_data_dir()
            .map(recovery::recovery_root)
            .map_err(|error| format!("앱 데이터 폴더를 확인할 수 없습니다: {error}"))?;
        recovery::delete_recovery_draft_in(&root, &app.state::<RecoveryState>(), request)
    })
    .await
    .map_err(|error| format!("복구 초안 삭제 작업을 완료하지 못했습니다: {error}"))?
}

#[tauri::command]
fn enable_close_guard(state: State<'_, CloseGuardState>) {
    close_guard::enable_close_guard(&state);
}

#[tauri::command]
fn resolve_close_request(
    window: Window,
    close_state: State<'_, CloseGuardState>,
    recovery_state: State<'_, RecoveryState>,
    request: ResolveCloseRequest,
) -> Result<(), String> {
    close_guard::resolve_close_request(window, &close_state, &recovery_state, request)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(FileWatchState::default())
        .manage(FolderTreeState::default())
        .manage(RecoveryState::default())
        .manage(CloseGuardState::default())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .menu(|app| {
            let menu = Menu::default(app)?;
            let open_item = MenuItemBuilder::with_id("open_markdown", "Open…")
                .accelerator("CmdOrCtrl+O")
                .build(app)?;
            let save_item = MenuItemBuilder::with_id("save_markdown", "Save")
                .accelerator("CmdOrCtrl+S")
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
                            submenu.prepend_items(&[&open_item, &save_item, &file_separator])?
                        }
                        "View" => submenu.prepend_items(&[
                            &zoom_in_item,
                            &zoom_out_item,
                            &actual_size_item,
                            &view_separator,
                        ])?,
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
            "save_markdown" => {
                let _ = app.emit("save-markdown-requested", ());
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
        .on_window_event(close_guard::handle_window_event)
        .invoke_handler(tauri::generate_handler![
            read_markdown_file,
            get_markdown_file_status,
            save_markdown_file,
            open_folder,
            list_folder_children,
            close_folder,
            open_folder_image,
            read_folder_markdown,
            watch_markdown_file,
            unwatch_markdown_file,
            save_recovery_draft,
            load_recovery_draft,
            delete_recovery_draft,
            enable_close_guard,
            resolve_close_request,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
