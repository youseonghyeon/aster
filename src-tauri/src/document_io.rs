use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::{
    fs,
    io::Write,
    path::{Path, PathBuf},
};
use tempfile::Builder;

pub(crate) const MAX_MARKDOWN_FILE_SIZE: u64 = 10 * 1024 * 1024;
const UTF8_BOM: &[u8] = &[0xEF, 0xBB, 0xBF];

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct TextFormat {
    pub(crate) has_bom: bool,
    pub(crate) line_ending: LineEnding,
}

impl Default for TextFormat {
    fn default() -> Self {
        Self {
            has_bom: false,
            line_ending: LineEnding::Lf,
        }
    }
}

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) enum LineEnding {
    Lf,
    Crlf,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct MarkdownDocument {
    pub(crate) path: String,
    pub(crate) name: String,
    pub(crate) content: String,
    pub(crate) revision: String,
    pub(crate) format: TextFormat,
}

#[derive(Debug, Serialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub(crate) enum MarkdownFileStatus {
    Available { revision: String },
    Unavailable { message: String },
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct SaveMarkdownRequest {
    pub(crate) path: String,
    pub(crate) content: String,
    pub(crate) expected_revision: Option<String>,
    #[serde(default)]
    pub(crate) format: TextFormat,
}

#[derive(Debug, Serialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub(crate) enum SaveMarkdownResult {
    Saved { document: MarkdownDocument },
    Conflict { revision: Option<String> },
}

pub(crate) fn read_markdown_file_from_disk(path: String) -> Result<MarkdownDocument, String> {
    for _ in 0..2 {
        let (canonical_path, metadata) = validate_existing_markdown_file(&path)?;
        let modified_before = metadata.modified().ok();
        let bytes = fs::read(&canonical_path)
            .map_err(|error| format!("UTF-8 Markdown 파일을 읽을 수 없습니다: {error}"))?;
        let metadata_after_read = fs::metadata(&canonical_path)
            .map_err(|error| format!("파일 정보를 다시 확인할 수 없습니다: {error}"))?;

        if metadata.len() != metadata_after_read.len()
            || modified_before != metadata_after_read.modified().ok()
        {
            continue;
        }

        let revision = revision_for_bytes(&bytes);
        let (content, format) = decode_markdown(&bytes)?;
        let name = canonical_path
            .file_name()
            .and_then(|name| name.to_str())
            .unwrap_or("문서.md")
            .to_owned();

        return Ok(MarkdownDocument {
            path: canonical_path.to_string_lossy().into_owned(),
            name,
            content,
            revision,
            format,
        });
    }

    Err("파일을 읽는 동안 내용이 계속 변경되었습니다. 잠시 후 다시 시도해 주세요.".into())
}

pub(crate) fn get_markdown_file_status_from_disk(path: String) -> MarkdownFileStatus {
    match validate_existing_markdown_file(&path).and_then(|(path, _)| {
        fs::read(path)
            .map(|bytes| revision_for_bytes(&bytes))
            .map_err(|error| format!("파일 내용을 확인할 수 없습니다: {error}"))
    }) {
        Ok(revision) => MarkdownFileStatus::Available { revision },
        Err(message) => MarkdownFileStatus::Unavailable { message },
    }
}

pub(crate) fn save_markdown_file_to_disk(
    request: SaveMarkdownRequest,
) -> Result<SaveMarkdownResult, String> {
    let target = resolve_save_target(&request.path)?;
    let encoded = encode_markdown(&request.content, &request.format);
    if encoded.len() as u64 > MAX_MARKDOWN_FILE_SIZE {
        return Err("10MB보다 큰 Markdown 파일은 저장할 수 없습니다.".into());
    }

    let parent = target
        .parent()
        .ok_or_else(|| "저장할 폴더를 확인할 수 없습니다.".to_owned())?;
    let existing_permissions = fs::metadata(&target)
        .ok()
        .map(|metadata| metadata.permissions());
    let mut temp = Builder::new()
        .prefix(".aster-save-")
        .tempfile_in(parent)
        .map_err(|error| format!("임시 저장 파일을 만들 수 없습니다: {error}"))?;
    if let Some(permissions) = existing_permissions {
        temp.as_file()
            .set_permissions(permissions)
            .map_err(|error| format!("파일 권한을 보존할 수 없습니다: {error}"))?;
    }
    temp.write_all(&encoded)
        .map_err(|error| format!("Markdown 내용을 기록할 수 없습니다: {error}"))?;
    temp.as_file_mut()
        .sync_all()
        .map_err(|error| format!("Markdown 내용을 디스크에 반영할 수 없습니다: {error}"))?;

    if let Some(expected_revision) = request.expected_revision.as_deref() {
        let current_revision = read_revision_if_available(&target)?;
        if current_revision.as_deref() != Some(expected_revision) {
            return Ok(SaveMarkdownResult::Conflict {
                revision: current_revision,
            });
        }
        temp.persist(&target)
            .map_err(|error| format!("원본 파일을 교체할 수 없습니다: {}", error.error))?;
    } else {
        match temp.persist_noclobber(&target) {
            Ok(_) => {}
            Err(error) if error.error.kind() == std::io::ErrorKind::AlreadyExists => {
                return Ok(SaveMarkdownResult::Conflict {
                    revision: read_revision_if_available(&target)?,
                });
            }
            Err(error) => {
                return Err(format!(
                    "새 Markdown 파일을 만들 수 없습니다: {}",
                    error.error
                ));
            }
        }
    }

    sync_directory(parent);
    read_markdown_file_from_disk(target.to_string_lossy().into_owned())
        .map(|document| SaveMarkdownResult::Saved { document })
}

pub(crate) fn validate_existing_markdown_file(
    path: &str,
) -> Result<(PathBuf, fs::Metadata), String> {
    validate_markdown_extension(Path::new(path))?;
    let canonical_path = PathBuf::from(path)
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

fn resolve_save_target(path: &str) -> Result<PathBuf, String> {
    let requested = PathBuf::from(path);
    validate_markdown_extension(&requested)?;
    let file_name = requested
        .file_name()
        .ok_or_else(|| "저장할 파일 이름을 확인할 수 없습니다.".to_owned())?;
    let parent = requested
        .parent()
        .ok_or_else(|| "저장할 폴더를 확인할 수 없습니다.".to_owned())?
        .canonicalize()
        .map_err(|error| format!("저장할 폴더를 확인할 수 없습니다: {error}"))?;
    Ok(parent.join(file_name))
}

fn validate_markdown_extension(path: &Path) -> Result<(), String> {
    let extension = path
        .extension()
        .and_then(|extension| extension.to_str())
        .map(str::to_ascii_lowercase);
    if matches!(extension.as_deref(), Some("md" | "markdown")) {
        Ok(())
    } else {
        Err("Markdown 파일(.md 또는 .markdown)만 사용할 수 있습니다.".into())
    }
}

fn read_revision_if_available(path: &Path) -> Result<Option<String>, String> {
    match fs::read(path) {
        Ok(bytes) => Ok(Some(revision_for_bytes(&bytes))),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(None),
        Err(error) => Err(format!("현재 원본 파일을 확인할 수 없습니다: {error}")),
    }
}

fn revision_for_bytes(bytes: &[u8]) -> String {
    format!("sha256:{:x}", Sha256::digest(bytes))
}

fn decode_markdown(bytes: &[u8]) -> Result<(String, TextFormat), String> {
    let has_bom = bytes.starts_with(UTF8_BOM);
    let body = if has_bom {
        &bytes[UTF8_BOM.len()..]
    } else {
        bytes
    };
    let text = std::str::from_utf8(body)
        .map_err(|error| format!("UTF-8 Markdown 파일을 읽을 수 없습니다: {error}"))?;
    let line_ending = if text.contains("\r\n") {
        LineEnding::Crlf
    } else {
        LineEnding::Lf
    };
    let content = text.replace("\r\n", "\n").replace('\r', "\n");
    Ok((
        content,
        TextFormat {
            has_bom,
            line_ending,
        },
    ))
}

fn encode_markdown(content: &str, format: &TextFormat) -> Vec<u8> {
    let normalized = content.replace("\r\n", "\n").replace('\r', "\n");
    let rendered = match format.line_ending {
        LineEnding::Lf => normalized,
        LineEnding::Crlf => normalized.replace('\n', "\r\n"),
    };
    let mut bytes = Vec::with_capacity(rendered.len() + usize::from(format.has_bom) * 3);
    if format.has_bom {
        bytes.extend_from_slice(UTF8_BOM);
    }
    bytes.extend_from_slice(rendered.as_bytes());
    bytes
}

#[cfg(unix)]
fn sync_directory(path: &Path) {
    if let Ok(directory) = fs::File::open(path) {
        let _ = directory.sync_all();
    }
}

#[cfg(not(unix))]
fn sync_directory(_path: &Path) {}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs::FileTimes;
    use tempfile::TempDir;

    fn test_path(directory: &TempDir, name: &str) -> PathBuf {
        directory.path().join(name)
    }

    fn save_request(path: &Path, content: &str, revision: Option<String>) -> SaveMarkdownRequest {
        SaveMarkdownRequest {
            path: path.to_string_lossy().into_owned(),
            content: content.into(),
            expected_revision: revision,
            format: TextFormat::default(),
        }
    }

    #[test]
    fn reads_normalized_text_with_hash_revision_and_format() {
        let directory = TempDir::new().unwrap();
        let path = test_path(&directory, "format.md");
        fs::write(&path, [UTF8_BOM, b"# title\r\nbody\r\n"].concat()).unwrap();

        let document = read_markdown_file_from_disk(path.to_string_lossy().into_owned()).unwrap();

        assert_eq!(document.content, "# title\nbody\n");
        assert_eq!(document.format.line_ending, LineEnding::Crlf);
        assert!(document.format.has_bom);
        assert_eq!(
            document.revision,
            revision_for_bytes(&fs::read(path).unwrap())
        );
    }

    #[test]
    fn hash_revision_detects_same_length_changes_even_with_nearby_timestamps() {
        let directory = TempDir::new().unwrap();
        let path = test_path(&directory, "same-size.md");
        fs::write(&path, b"aaaa").unwrap();
        let original_modified = fs::metadata(&path).unwrap().modified().unwrap();
        let first = read_revision_if_available(&path).unwrap();
        fs::write(&path, b"bbbb").unwrap();
        fs::OpenOptions::new()
            .write(true)
            .open(&path)
            .unwrap()
            .set_times(FileTimes::new().set_modified(original_modified))
            .unwrap();
        let second = read_revision_if_available(&path).unwrap();
        assert_ne!(first, second);
        assert_eq!(
            fs::metadata(&path).unwrap().modified().unwrap(),
            original_modified
        );
    }

    #[test]
    fn saves_only_against_expected_revision_and_preserves_format() {
        let directory = TempDir::new().unwrap();
        let path = test_path(&directory, "saved.md");
        fs::write(&path, [UTF8_BOM, b"old\r\n"].concat()).unwrap();
        let opened = read_markdown_file_from_disk(path.to_string_lossy().into_owned()).unwrap();
        let request = SaveMarkdownRequest {
            path: opened.path,
            content: "new\nline\n".into(),
            expected_revision: Some(opened.revision),
            format: opened.format,
        };

        assert!(matches!(
            save_markdown_file_to_disk(request).unwrap(),
            SaveMarkdownResult::Saved { .. }
        ));
        assert_eq!(
            fs::read(path).unwrap(),
            [UTF8_BOM, b"new\r\nline\r\n"].concat()
        );
    }

    #[test]
    fn rejects_stale_revision_without_overwriting() {
        let directory = TempDir::new().unwrap();
        let path = test_path(&directory, "conflict.md");
        fs::write(&path, b"external").unwrap();

        let result =
            save_markdown_file_to_disk(save_request(&path, "local", Some("sha256:stale".into())))
                .unwrap();

        assert!(matches!(result, SaveMarkdownResult::Conflict { .. }));
        assert_eq!(fs::read_to_string(path).unwrap(), "external");
    }

    #[test]
    fn create_only_never_clobbers_an_existing_path() {
        let directory = TempDir::new().unwrap();
        let path = test_path(&directory, "existing.md");
        fs::write(&path, b"keep").unwrap();

        let result = save_markdown_file_to_disk(save_request(&path, "replace", None)).unwrap();

        assert!(matches!(result, SaveMarkdownResult::Conflict { .. }));
        assert_eq!(fs::read_to_string(path).unwrap(), "keep");
    }

    #[test]
    fn creates_a_new_markdown_file() {
        let directory = TempDir::new().unwrap();
        let path = test_path(&directory, "new.md");

        let result = save_markdown_file_to_disk(save_request(&path, "# new\n", None)).unwrap();

        assert!(matches!(result, SaveMarkdownResult::Saved { .. }));
        assert_eq!(fs::read_to_string(path).unwrap(), "# new\n");
    }
}
