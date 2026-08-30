use crate::document_io;
use base64::{engine::general_purpose::STANDARD, Engine as _};
use std::{
    fs,
    path::{Component, Path, PathBuf},
};

const MAX_LINKED_IMAGE_SIZE: u64 = 20 * 1024 * 1024;

pub(crate) fn resolve_relative_markdown_path(
    document_path: String,
    relative_path: String,
) -> Result<String, String> {
    let requested = resolve_relative_resource(&document_path, &relative_path)?;
    let (canonical, _) = document_io::validate_existing_markdown_file(
        requested
            .to_str()
            .ok_or_else(|| "Markdown 경로를 UTF-8로 표현할 수 없습니다.".to_owned())?,
    )?;
    Ok(canonical.to_string_lossy().into_owned())
}

pub(crate) fn read_relative_image(
    document_path: String,
    relative_path: String,
) -> Result<String, String> {
    let requested = resolve_relative_resource(&document_path, &relative_path)?;
    let canonical = requested
        .canonicalize()
        .map_err(|error| format!("이미지 경로를 확인할 수 없습니다: {error}"))?;
    let mime_type = image_mime_type(&canonical)?;
    let metadata = fs::metadata(&canonical)
        .map_err(|error| format!("이미지 정보를 읽을 수 없습니다: {error}"))?;
    if !metadata.is_file() {
        return Err("선택한 이미지 경로가 파일이 아닙니다.".into());
    }
    if metadata.len() > MAX_LINKED_IMAGE_SIZE {
        return Err("20MB보다 큰 이미지는 미리보기에 표시할 수 없습니다.".into());
    }
    let bytes =
        fs::read(&canonical).map_err(|error| format!("이미지 파일을 읽을 수 없습니다: {error}"))?;
    if bytes.len() as u64 > MAX_LINKED_IMAGE_SIZE {
        return Err("20MB보다 큰 이미지는 미리보기에 표시할 수 없습니다.".into());
    }
    Ok(format!(
        "data:{mime_type};base64,{}",
        STANDARD.encode(bytes)
    ))
}

fn resolve_relative_resource(document_path: &str, relative_path: &str) -> Result<PathBuf, String> {
    let relative = validate_relative_resource_path(relative_path)?;
    let (document, _) = document_io::validate_existing_markdown_file(document_path)?;
    let parent = document
        .parent()
        .ok_or_else(|| "현재 문서 폴더를 확인할 수 없습니다.".to_owned())?;
    Ok(parent.join(relative))
}

fn validate_relative_resource_path(relative_path: &str) -> Result<&Path, String> {
    if relative_path.is_empty() || relative_path.contains('\0') {
        return Err("상대 경로가 비어 있거나 올바르지 않습니다.".into());
    }
    if relative_path.contains('\\') {
        return Err("Markdown 상대 경로에는 / 구분자를 사용해 주세요.".into());
    }
    let path = Path::new(relative_path);
    if path.is_absolute()
        || path
            .components()
            .any(|component| matches!(component, Component::Prefix(_) | Component::RootDir))
        || has_windows_drive_prefix(relative_path)
    {
        return Err("절대 파일 경로는 열 수 없습니다.".into());
    }
    Ok(path)
}

fn has_windows_drive_prefix(path: &str) -> bool {
    let bytes = path.as_bytes();
    bytes.len() >= 3
        && bytes[0].is_ascii_alphabetic()
        && bytes[1] == b':'
        && matches!(bytes[2], b'/' | b'\\')
}

fn image_mime_type(path: &Path) -> Result<&'static str, String> {
    match path
        .extension()
        .and_then(|extension| extension.to_str())
        .map(str::to_ascii_lowercase)
        .as_deref()
    {
        Some("png") => Ok("image/png"),
        Some("jpg" | "jpeg") => Ok("image/jpeg"),
        Some("gif") => Ok("image/gif"),
        Some("webp") => Ok("image/webp"),
        Some("svg") => Ok("image/svg+xml"),
        _ => Err("지원하는 이미지(png, jpg, jpeg, gif, webp, svg)만 표시할 수 있습니다.".into()),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;
    use tempfile::TempDir;

    fn fixture() -> (TempDir, PathBuf) {
        let temp = TempDir::new().expect("temp directory");
        let guide = temp.path().join("guide");
        fs::create_dir(&guide).expect("guide directory");
        let current = guide.join("current.md");
        fs::write(&current, "# Current").expect("current document");
        fs::write(temp.path().join("README.md"), "# Root").expect("target document");
        (temp, current)
    }

    #[test]
    fn resolves_parent_markdown_from_the_current_document() {
        let (temp, current) = fixture();
        let resolved = resolve_relative_markdown_path(
            current.to_string_lossy().into_owned(),
            "../README.md".into(),
        )
        .expect("relative Markdown");

        assert_eq!(
            PathBuf::from(resolved),
            temp.path()
                .join("README.md")
                .canonicalize()
                .expect("canonical target"),
        );
    }

    #[test]
    fn rejects_absolute_and_non_markdown_document_links() {
        let (temp, current) = fixture();
        fs::write(temp.path().join("notes.txt"), "notes").expect("text file");

        assert!(resolve_relative_markdown_path(
            current.to_string_lossy().into_owned(),
            temp.path().join("README.md").to_string_lossy().into_owned(),
        )
        .is_err());
        assert!(resolve_relative_markdown_path(
            current.to_string_lossy().into_owned(),
            "../notes.txt".into(),
        )
        .is_err());
    }

    #[test]
    fn reads_supported_relative_images_as_data_urls() {
        let (temp, current) = fixture();
        let image = temp.path().join("cover.png");
        fs::File::create(&image)
            .expect("image")
            .write_all(&[0x89, b'P', b'N', b'G'])
            .expect("image bytes");

        let data_url = read_relative_image(
            current.to_string_lossy().into_owned(),
            "../cover.png".into(),
        )
        .expect("relative image");

        assert_eq!(data_url, "data:image/png;base64,iVBORw==");
    }

    #[test]
    fn rejects_unsupported_and_oversized_images() {
        let (temp, current) = fixture();
        fs::write(temp.path().join("image.bmp"), [0_u8; 4]).expect("unsupported image");
        let large = fs::File::create(temp.path().join("large.webp")).expect("large image");
        large
            .set_len(MAX_LINKED_IMAGE_SIZE + 1)
            .expect("oversized sparse image");

        assert!(read_relative_image(
            current.to_string_lossy().into_owned(),
            "../image.bmp".into(),
        )
        .is_err());
        assert!(read_relative_image(
            current.to_string_lossy().into_owned(),
            "../large.webp".into(),
        )
        .is_err());
    }
}
