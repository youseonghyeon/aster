//! Public AppKit editing actions. No menu-object access or synthetic keystrokes.
use serde::Deserialize;

#[derive(Clone, Copy, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum EditCommand {
    Undo,
    Redo,
    Cut,
    Copy,
    Paste,
    SelectAll,
}

#[tauri::command]
pub async fn perform_edit_command(
    window: tauri::WebviewWindow,
    command: EditCommand,
) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        use objc2::{sel, MainThreadMarker};
        use objc2_app_kit::NSApplication;
        let expected_window = window.ns_window().map_err(|e| e.to_string())? as usize;
        let (sender, receiver) = std::sync::mpsc::channel();
        window
            .run_on_main_thread(move || {
                let result = (|| {
                    let mtm = MainThreadMarker::new().ok_or("편집 명령을 실행할 수 없습니다.")?;
                    let app = NSApplication::sharedApplication(mtm);
                    if !app.isActive() {
                        return Err("앱이 비활성 상태입니다.");
                    }
                    let key_window = app.keyWindow().ok_or("활성 창이 없습니다.")?;
                    if objc2::rc::Retained::as_ptr(&key_window) as usize != expected_window {
                        return Err("앱 창이 변경됐습니다.");
                    }
                    let selector = match command {
                        EditCommand::Undo => sel!(undo:),
                        EditCommand::Redo => sel!(redo:),
                        EditCommand::Cut => sel!(cut:),
                        EditCommand::Copy => sel!(copy:),
                        EditCommand::Paste => sel!(paste:),
                        EditCommand::SelectAll => sel!(selectAll:),
                    };
                    // Standard documented AppKit actions; nil target uses the key window's responder chain.
                    if unsafe { app.sendAction_to_from(selector, None, None) } {
                        Ok(())
                    } else {
                        Err("현재 위치에서 실행할 수 없는 편집 명령입니다.")
                    }
                })()
                .map_err(str::to_owned);
                let _ = sender.send(result);
            })
            .map_err(|e| e.to_string())?;
        tauri::async_runtime::spawn_blocking(move || receiver.recv())
            .await
            .map_err(|e| e.to_string())?
            .map_err(|e| e.to_string())?
    }
    #[cfg(not(target_os = "macos"))]
    {
        let _ = (window, command);
        Err("이 환경에서는 앱 편집 메뉴를 지원하지 않습니다.".into())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn accepts_only_known_editing_actions() {
        for action in ["undo", "redo", "cut", "copy", "paste", "selectAll"] {
            assert!(serde_json::from_value::<EditCommand>(serde_json::json!(action)).is_ok());
        }
        for action in ["reload", "quit", "delete:", "performSelector:"] {
            assert!(serde_json::from_value::<EditCommand>(serde_json::json!(action)).is_err());
        }
    }
}
