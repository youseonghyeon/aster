use crate::document_io::MAX_MARKDOWN_FILE_SIZE;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::{
    collections::HashMap,
    fs,
    io::Write,
    path::{Path, PathBuf},
    sync::Mutex,
    time::{SystemTime, UNIX_EPOCH},
};
use tempfile::Builder;

const RECOVERY_VERSION: u32 = 1;

#[derive(Debug, Default)]
pub(crate) struct RecoveryState {
    fences: Mutex<HashMap<String, u64>>,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct RecoveryDraft {
    pub(crate) version: u32,
    pub(crate) identity: String,
    pub(crate) path: Option<String>,
    pub(crate) content: String,
    pub(crate) base_revision: Option<String>,
    pub(crate) updated_at: u64,
    pub(crate) sequence: u64,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct SaveRecoveryDraftRequest {
    pub(crate) identity: String,
    pub(crate) path: Option<String>,
    pub(crate) content: String,
    pub(crate) base_revision: Option<String>,
    pub(crate) sequence: u64,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct DeleteRecoveryDraftRequest {
    pub(crate) identity: String,
    pub(crate) sequence: u64,
}

#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct RecoveryEnvelope {
    version: u32,
    identity: String,
    sequence: u64,
    draft: Option<RecoveryDraft>,
}

pub(crate) fn save_recovery_draft_in(
    root: &Path,
    state: &RecoveryState,
    request: SaveRecoveryDraftRequest,
) -> Result<bool, String> {
    if request.content.len() as u64 > MAX_MARKDOWN_FILE_SIZE {
        return Err("복구 초안이 10MB 제한을 초과했습니다.".into());
    }
    let draft = RecoveryDraft {
        version: RECOVERY_VERSION,
        identity: request.identity.clone(),
        path: request.path,
        content: request.content,
        base_revision: request.base_revision,
        updated_at: now_millis(),
        sequence: request.sequence,
    };
    apply_envelope(
        root,
        state,
        RecoveryEnvelope {
            version: RECOVERY_VERSION,
            identity: request.identity,
            sequence: request.sequence,
            draft: Some(draft),
        },
    )
}

pub(crate) fn delete_recovery_draft_in(
    root: &Path,
    state: &RecoveryState,
    request: DeleteRecoveryDraftRequest,
) -> Result<bool, String> {
    apply_envelope(
        root,
        state,
        RecoveryEnvelope {
            version: RECOVERY_VERSION,
            identity: request.identity,
            sequence: request.sequence,
            draft: None,
        },
    )
}

pub(crate) fn load_recovery_draft_in(
    root: &Path,
    state: &RecoveryState,
    identity: &str,
) -> Result<Option<RecoveryDraft>, String> {
    let _guard = state
        .fences
        .lock()
        .map_err(|_| "복구 저장소 잠금을 사용할 수 없습니다.".to_owned())?;
    let path = envelope_path(root, identity);
    let bytes = match fs::read(path) {
        Ok(bytes) => bytes,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(None),
        Err(error) => return Err(format!("복구 초안을 읽을 수 없습니다: {error}")),
    };
    let envelope: RecoveryEnvelope = serde_json::from_slice(&bytes)
        .map_err(|error| format!("복구 초안 형식을 확인할 수 없습니다: {error}"))?;
    if envelope.version != RECOVERY_VERSION || envelope.identity != identity {
        return Err("지원하지 않거나 잘못된 복구 초안입니다.".into());
    }
    Ok(envelope.draft)
}

fn apply_envelope(
    root: &Path,
    state: &RecoveryState,
    envelope: RecoveryEnvelope,
) -> Result<bool, String> {
    let mut fences = state
        .fences
        .lock()
        .map_err(|_| "복구 저장소 잠금을 사용할 수 없습니다.".to_owned())?;
    fs::create_dir_all(root).map_err(|error| format!("복구 저장소를 만들 수 없습니다: {error}"))?;
    let path = envelope_path(root, &envelope.identity);
    let persisted_sequence = read_envelope_sequence(&path).unwrap_or(0);
    let known_sequence = fences
        .get(&envelope.identity)
        .copied()
        .unwrap_or(persisted_sequence)
        .max(persisted_sequence);
    if envelope.sequence <= known_sequence {
        return Ok(false);
    }

    let bytes = serde_json::to_vec(&envelope)
        .map_err(|error| format!("복구 초안을 직렬화할 수 없습니다: {error}"))?;
    let mut temp = Builder::new()
        .prefix(".aster-recovery-")
        .tempfile_in(root)
        .map_err(|error| format!("복구 임시 파일을 만들 수 없습니다: {error}"))?;
    temp.write_all(&bytes)
        .map_err(|error| format!("복구 초안을 기록할 수 없습니다: {error}"))?;
    temp.as_file_mut()
        .sync_all()
        .map_err(|error| format!("복구 초안을 디스크에 반영할 수 없습니다: {error}"))?;
    temp.persist(&path)
        .map_err(|error| format!("복구 초안을 교체할 수 없습니다: {}", error.error))?;
    fences.insert(envelope.identity, envelope.sequence);
    Ok(true)
}

fn read_envelope_sequence(path: &Path) -> Option<u64> {
    serde_json::from_slice::<RecoveryEnvelope>(&fs::read(path).ok()?)
        .ok()
        .map(|envelope| envelope.sequence)
}

fn envelope_path(root: &Path, identity: &str) -> PathBuf {
    root.join(format!("{:x}.json", Sha256::digest(identity.as_bytes())))
}

pub(crate) fn recovery_root(app_data_dir: PathBuf) -> PathBuf {
    app_data_dir.join("recovery-drafts")
}

fn now_millis() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis() as u64)
        .unwrap_or(0)
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    fn save(identity: &str, sequence: u64, content: &str) -> SaveRecoveryDraftRequest {
        SaveRecoveryDraftRequest {
            identity: identity.into(),
            path: Some(format!("/docs/{identity}.md")),
            content: content.into(),
            base_revision: Some("sha256:base".into()),
            sequence,
        }
    }

    #[test]
    fn stores_loads_and_tombstones_a_draft() {
        let directory = TempDir::new().unwrap();
        let state = RecoveryState::default();
        assert!(save_recovery_draft_in(directory.path(), &state, save("one", 1, "draft")).unwrap());
        assert_eq!(
            load_recovery_draft_in(directory.path(), &state, "one")
                .unwrap()
                .unwrap()
                .content,
            "draft"
        );
        assert!(delete_recovery_draft_in(
            directory.path(),
            &state,
            DeleteRecoveryDraftRequest {
                identity: "one".into(),
                sequence: 2,
            },
        )
        .unwrap());
        assert!(load_recovery_draft_in(directory.path(), &state, "one")
            .unwrap()
            .is_none());
    }

    #[test]
    fn tombstone_rejects_a_late_write_even_after_restart() {
        let directory = TempDir::new().unwrap();
        let first_state = RecoveryState::default();
        delete_recovery_draft_in(
            directory.path(),
            &first_state,
            DeleteRecoveryDraftRequest {
                identity: "same".into(),
                sequence: 5,
            },
        )
        .unwrap();

        let restarted_state = RecoveryState::default();
        assert!(!save_recovery_draft_in(
            directory.path(),
            &restarted_state,
            save("same", 4, "late"),
        )
        .unwrap());
        assert!(
            load_recovery_draft_in(directory.path(), &restarted_state, "same")
                .unwrap()
                .is_none()
        );
    }

    #[test]
    fn isolates_corrupt_recovery_data() {
        let directory = TempDir::new().unwrap();
        let state = RecoveryState::default();
        fs::write(envelope_path(directory.path(), "broken"), b"not-json").unwrap();
        assert!(load_recovery_draft_in(directory.path(), &state, "broken").is_err());
    }
}
