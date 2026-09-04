use reqwest::{header, Client, Url};
use semver::Version;
use serde::{Deserialize, Serialize};
use std::time::Duration;

const LATEST_RELEASE_API_URL: &str =
    "https://api.github.com/repos/youseonghyeon/aster/releases/latest";
const RELEASE_PATH_PREFIX: &str = "/youseonghyeon/aster/releases/";

#[derive(Debug, Deserialize)]
struct GitHubRelease {
    tag_name: String,
    html_url: String,
}

#[derive(Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct UpdateCheckResult {
    current_version: String,
    latest_version: String,
    release_url: String,
    update_available: bool,
}

pub(crate) async fn check_for_update(current_version: &str) -> Result<UpdateCheckResult, String> {
    let client = Client::builder()
        .timeout(Duration::from_secs(8))
        .user_agent(format!("Aster/{current_version}"))
        .build()
        .map_err(|error| format!("업데이트 확인 요청을 준비할 수 없습니다: {error}"))?;
    let response = client
        .get(LATEST_RELEASE_API_URL)
        .header(header::ACCEPT, "application/vnd.github+json")
        .header("X-GitHub-Api-Version", "2022-11-28")
        .send()
        .await
        .map_err(|error| format!("GitHub에서 최신 버전을 확인할 수 없습니다: {error}"))?
        .error_for_status()
        .map_err(|error| format!("GitHub 최신 릴리스 응답을 확인할 수 없습니다: {error}"))?;
    let body = response
        .text()
        .await
        .map_err(|error| format!("GitHub 최신 릴리스 응답을 읽을 수 없습니다: {error}"))?;

    parse_release(current_version, &body)
}

fn parse_release(current_version: &str, body: &str) -> Result<UpdateCheckResult, String> {
    let release: GitHubRelease = serde_json::from_str(body)
        .map_err(|error| format!("GitHub 최신 릴리스 형식을 해석할 수 없습니다: {error}"))?;
    let current = parse_version(current_version, "현재 앱")?;
    let latest = parse_version(&release.tag_name, "GitHub 릴리스")?;
    let release_url = validate_release_url(&release.html_url)?;

    Ok(UpdateCheckResult {
        current_version: current.to_string(),
        latest_version: latest.to_string(),
        release_url,
        update_available: latest > current,
    })
}

fn parse_version(value: &str, source: &str) -> Result<Version, String> {
    Version::parse(value.strip_prefix('v').unwrap_or(value))
        .map_err(|error| format!("{source} 버전이 올바른 형식이 아닙니다: {error}"))
}

fn validate_release_url(value: &str) -> Result<String, String> {
    let url = Url::parse(value)
        .map_err(|error| format!("GitHub 릴리스 주소가 올바르지 않습니다: {error}"))?;
    let is_expected = url.scheme() == "https"
        && url.host_str() == Some("github.com")
        && url.path().starts_with(RELEASE_PATH_PREFIX)
        && url.query().is_none()
        && url.fragment().is_none();

    if !is_expected {
        return Err("GitHub 릴리스 주소가 허용된 범위를 벗어났습니다.".to_string());
    }

    Ok(url.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn release_json(tag_name: &str, html_url: &str) -> String {
        serde_json::json!({
            "tag_name": tag_name,
            "html_url": html_url,
        })
        .to_string()
    }

    #[test]
    fn detects_a_newer_semantic_version() {
        let result = parse_release(
            "1.7.0",
            &release_json(
                "v1.8.0",
                "https://github.com/youseonghyeon/aster/releases/tag/v1.8.0",
            ),
        )
        .expect("release should parse");

        assert_eq!(result.current_version, "1.7.0");
        assert_eq!(result.latest_version, "1.8.0");
        assert!(result.update_available);
    }

    #[test]
    fn does_not_offer_the_same_or_an_older_version() {
        for latest in ["v1.7.0", "v1.6.9"] {
            let result = parse_release(
                "1.7.0",
                &release_json(
                    latest,
                    "https://github.com/youseonghyeon/aster/releases/tag/v1.7.0",
                ),
            )
            .expect("release should parse");

            assert!(!result.update_available);
        }
    }

    #[test]
    fn rejects_an_unexpected_release_url() {
        let error = parse_release(
            "1.7.0",
            &release_json("v1.8.0", "https://example.com/releases/v1.8.0"),
        )
        .expect_err("unexpected host should be rejected");

        assert!(error.contains("허용된 범위"));
    }
}
