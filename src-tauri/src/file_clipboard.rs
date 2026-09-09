use std::path::Path;

/// Use native file representations; a path string is not a copied file.
#[cfg(target_os = "macos")]
pub(crate) fn copy_file(path: &Path, name_only: bool) -> Result<(), String> {
    write_copy(
        &objc2_app_kit::NSPasteboard::generalPasteboard(),
        path,
        name_only,
    )
}

#[cfg(target_os = "macos")]
fn write_copy(
    pasteboard: &objc2_app_kit::NSPasteboard,
    path: &Path,
    name_only: bool,
) -> Result<(), String> {
    use objc2::{rc::Retained, runtime::ProtocolObject};
    use objc2_app_kit::{NSPasteboardItem, NSPasteboardWriting};
    use objc2_foundation::{NSArray, NSString, NSURL};

    let name = path
        .file_name()
        .and_then(|value| value.to_str())
        .ok_or("파일 이름을 표현할 수 없습니다.")?;
    let name = NSString::from_str(name);
    let path = path.to_str().ok_or("파일 경로를 표현할 수 없습니다.")?;
    let url = NSURL::fileURLWithPath(&NSString::from_str(path));
    let object: &ProtocolObject<dyn NSPasteboardWriting> = if name_only {
        ProtocolObject::from_ref(&*name)
    } else {
        ProtocolObject::from_ref(&*url)
    };
    let objects = NSArray::from_slice(&[object]);
    // Materialize every existing type before replacing the general pasteboard.
    // Retaining the old items alone is insufficient after clearContents.
    let previous_change = pasteboard.changeCount();
    let mut saved: Vec<Retained<NSPasteboardItem>> = Vec::new();
    if let Some(items) = pasteboard.pasteboardItems() {
        for item in items.iter() {
            let snapshot = NSPasteboardItem::new();
            for kind in item.types().iter() {
                let data = item
                    .dataForType(&kind)
                    .ok_or("기존 클립보드를 보존할 수 없습니다.")?;
                if !snapshot.setData_forType(&data, &kind) {
                    return Err("기존 클립보드를 보존할 수 없습니다.".into());
                }
            }
            saved.push(snapshot);
        }
    }
    if pasteboard.changeCount() != previous_change {
        return Err("클립보드가 변경되었습니다. 다시 복사해 주세요.".into());
    }
    pasteboard.clearContents();
    if pasteboard.writeObjects(&objects) {
        return Ok(());
    }
    let saved: Vec<&ProtocolObject<dyn NSPasteboardWriting>> = saved
        .iter()
        .map(|item| ProtocolObject::from_ref(&**item))
        .collect();
    pasteboard.clearContents();
    if !saved.is_empty() && !pasteboard.writeObjects(&NSArray::from_slice(&saved)) {
        return Err("파일 복사와 기존 클립보드 복원에 실패했습니다.".into());
    }
    Err("파일을 클립보드에 복사하지 못했습니다.".into())
}

#[cfg(not(target_os = "macos"))]
pub(crate) fn copy_file(_path: &Path, _name_only: bool) -> Result<(), String> {
    Err("파일 복사는 현재 macOS에서 지원합니다.".into())
}

#[cfg(all(test, target_os = "macos"))]
mod tests {
    use super::*;
    use objc2_app_kit::NSPasteboard;
    use objc2_foundation::NSString;

    #[test]
    fn writes_file_url_and_plain_name_as_distinct_native_formats() {
        // A private pasteboard tests real serialization without altering the user's clipboard.
        let pasteboard = NSPasteboard::pasteboardWithUniqueName();
        let path = Path::new("/tmp/한글 공백.markdown");
        write_copy(&pasteboard, path, false).unwrap();
        let url_type = NSString::from_str("public.file-url");
        let text_type = NSString::from_str("public.utf8-plain-text");
        let url = pasteboard.stringForType(&url_type).unwrap().to_string();
        assert!(url.starts_with("file:///tmp/"));
        assert!(url.contains("%20"));
        assert!(url.ends_with(".markdown"));
        write_copy(&pasteboard, path, true).unwrap();
        assert_eq!(
            pasteboard.stringForType(&text_type).unwrap().to_string(),
            "한글 공백.markdown"
        );
        assert!(pasteboard.stringForType(&url_type).is_none());
        assert!(write_copy(&pasteboard, Path::new("/"), true).is_err());
        assert_eq!(
            pasteboard.stringForType(&text_type).unwrap().to_string(),
            "한글 공백.markdown"
        );
        pasteboard.clearContents();
    }
}
