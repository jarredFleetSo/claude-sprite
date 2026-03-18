use crate::config::GlobalConfig;
use crate::error::{CsError, Result};
use crate::sprite::SpriteClient;
use serde::Deserialize;
use std::process::Command;

#[derive(Debug, Deserialize)]
struct ApiResponse {
    #[serde(default)]
    sprites: Option<Vec<SpriteInfo>>,
    #[serde(default)]
    data: Option<Vec<SpriteInfo>>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct SpriteInfo {
    #[serde(default)]
    pub name: String,
    #[serde(default)]
    pub status: String,
    #[serde(default, alias = "lastActiveAt")]
    pub last_active_at: String,
    #[serde(default, alias = "lastStartedAt")]
    pub last_started_at: String,
    #[serde(default)]
    #[allow(dead_code)]
    pub url: String,
}

/// Fetch list of sprites from API using `sprite api` command
pub fn list_sprites(config: &GlobalConfig) -> Result<Vec<SpriteInfo>> {
    SpriteClient::require_cli()?;

    let mut cmd = Command::new("sprite");
    cmd.arg("api");
    if !config.org.is_empty() {
        cmd.arg("-o").arg(&config.org);
    }
    cmd.arg("/v1/sprites");

    let output = cmd.output()?;

    let stdout = String::from_utf8_lossy(&output.stdout).to_string();
    // sprite api may exit 0 but return {"error": "..."} — detect that
    let api_ok = output.status.success() && !stdout.contains("\"error\"");
    let json_str = if api_ok {
        stdout
    } else if !config.sprite_token.is_empty() {
        // Fallback: curl with explicit token
        let curl_output = Command::new("curl")
            .args(["-sf", "-H"])
            .arg(format!("Authorization: Bearer {}", config.sprite_token))
            .arg("https://api.sprites.dev/v1/sprites")
            .output()?;

        if !curl_output.status.success() {
            return Err(CsError::user(
                "Failed to fetch sprites. Check your token and network.",
            ));
        }
        String::from_utf8_lossy(&curl_output.stdout).to_string()
    } else {
        return Err(CsError::user(
            "Failed to fetch sprites. Run 'sprite login' or set a token with 'cs setup'.",
        ));
    };

    parse_sprites(&json_str)
}

fn parse_sprites(json_str: &str) -> Result<Vec<SpriteInfo>> {
    // Try as array first
    if let Ok(sprites) = serde_json::from_str::<Vec<SpriteInfo>>(json_str) {
        return Ok(sprites);
    }

    // Try as object with sprites or data field
    let response: ApiResponse =
        serde_json::from_str(json_str).map_err(|_| CsError::user("Failed to parse API response"))?;

    if let Some(sprites) = response.sprites {
        Ok(sprites)
    } else if let Some(data) = response.data {
        Ok(data)
    } else {
        Ok(vec![])
    }
}

/// Format an ISO timestamp as relative time (e.g., "5m", "2h 30m", "3d")
pub fn format_relative_time(ts: &str) -> String {
    if ts.is_empty() {
        return "—".to_string();
    }

    let ts = ts.replace('Z', "+00:00");
    let dt = match chrono::DateTime::parse_from_rfc3339(&ts) {
        Ok(dt) => dt,
        Err(_) => {
            // Try without timezone
            match chrono::NaiveDateTime::parse_from_str(&ts, "%Y-%m-%dT%H:%M:%S") {
                Ok(naive) => naive
                    .and_utc()
                    .fixed_offset(),
                Err(_) => return "—".to_string(),
            }
        }
    };

    let now = chrono::Utc::now();
    let diff = now.signed_duration_since(dt);
    let secs = diff.num_seconds();

    if secs < 0 {
        "just now".to_string()
    } else if secs < 60 {
        format!("{}s", secs)
    } else if secs < 3600 {
        format!("{}m", secs / 60)
    } else if secs < 86400 {
        let h = secs / 3600;
        let m = (secs % 3600) / 60;
        if m > 0 {
            format!("{}h {:02}m", h, m)
        } else {
            format!("{}h", h)
        }
    } else {
        format!("{}d", secs / 86400)
    }
}
