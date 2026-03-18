use crate::error::{CsError, Result};
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};

/// Global config stored at ~/.config/cs/config.toml
#[derive(Debug, Default, Serialize, Deserialize)]
pub struct GlobalConfig {
    #[serde(default)]
    pub sprite_name: String,
    #[serde(default)]
    pub org: String,
    #[serde(default)]
    pub tmux_session: String,
    #[serde(default)]
    pub sprite_token: String,
}

/// Per-project config stored at .cs.toml in project root
#[derive(Debug, Default, Serialize, Deserialize)]
pub struct ProjectConfig {
    pub sprite: String,
}

impl GlobalConfig {
    pub fn config_dir() -> PathBuf {
        dirs::home_dir()
            .unwrap_or_else(|| PathBuf::from("~"))
            .join(".config")
            .join("cs")
    }

    pub fn config_path() -> PathBuf {
        Self::config_dir().join("config.toml")
    }

    fn legacy_config_path() -> PathBuf {
        Self::config_dir().join("config")
    }

    pub fn load() -> Self {
        // Try TOML config first
        if let Ok(contents) = fs::read_to_string(Self::config_path()) {
            if let Ok(config) = toml::from_str::<GlobalConfig>(&contents) {
                return config.with_env_overrides();
            }
        }

        // Try migrating legacy shell-format config
        if let Ok(config) = Self::migrate_legacy() {
            return config.with_env_overrides();
        }

        Self::default().with_env_overrides()
    }

    /// Migrate from old shell `source`-able config to TOML
    fn migrate_legacy() -> Result<Self> {
        let legacy_path = Self::legacy_config_path();
        let contents = fs::read_to_string(&legacy_path).map_err(|e| CsError::Io(e))?;

        let mut config = GlobalConfig::default();
        for line in contents.lines() {
            let line = line.trim();
            if line.starts_with('#') || line.is_empty() {
                continue;
            }
            if let Some((key, val)) = line.split_once('=') {
                let key = key.trim();
                let val = val.trim().trim_matches('"');
                match key {
                    "CS_SPRITE_NAME" => config.sprite_name = val.to_string(),
                    "CS_ORG" => config.org = val.to_string(),
                    "CS_TMUX_SESSION" => config.tmux_session = val.to_string(),
                    "CS_SPRITE_TOKEN" => config.sprite_token = val.to_string(),
                    _ => {}
                }
            }
        }

        // Write new TOML config
        config.save()?;
        Ok(config)
    }

    fn with_env_overrides(mut self) -> Self {
        if let Ok(v) = std::env::var("CS_SPRITE_NAME") {
            if !v.is_empty() {
                self.sprite_name = v;
            }
        }
        if let Ok(v) = std::env::var("CS_ORG") {
            if !v.is_empty() {
                self.org = v;
            }
        }
        if let Ok(v) = std::env::var("CS_TMUX_SESSION") {
            if !v.is_empty() {
                self.tmux_session = v;
            }
        }
        // SPRITE_TOKEN or CS_SPRITE_TOKEN
        if let Ok(v) = std::env::var("SPRITE_TOKEN") {
            if !v.is_empty() {
                self.sprite_token = v;
            }
        } else if let Ok(v) = std::env::var("CS_SPRITE_TOKEN") {
            if !v.is_empty() {
                self.sprite_token = v;
            }
        }
        if self.tmux_session.is_empty() {
            self.tmux_session = "workspace".to_string();
        }
        self
    }

    pub fn save(&self) -> Result<()> {
        let dir = Self::config_dir();
        fs::create_dir_all(&dir)?;
        let path = Self::config_path();
        let contents = toml::to_string_pretty(self)
            .map_err(|e| CsError::user(format!("Failed to serialize config: {e}")))?;
        fs::write(&path, contents)?;
        // chmod 600
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            fs::set_permissions(&path, fs::Permissions::from_mode(0o600))?;
        }
        crate::output::info(&format!("Config saved to {}", path.display()));
        Ok(())
    }
}

impl ProjectConfig {
    /// Find .cs.toml by walking up from cwd to git root
    pub fn find() -> Option<Self> {
        let project_root = crate::paths::get_local_project_path();
        let config_path = project_root.join(".cs.toml");
        Self::load_from(&config_path)
    }

    fn load_from(path: &Path) -> Option<Self> {
        let contents = fs::read_to_string(path).ok()?;
        toml::from_str(&contents).ok()
    }

    pub fn save(sprite_name: &str) -> Result<()> {
        let project_root = crate::paths::get_local_project_path();
        let config_path = project_root.join(".cs.toml");
        let config = ProjectConfig {
            sprite: sprite_name.to_string(),
        };
        let contents = format!(
            "# Auto-created by cs — add to .gitignore\nsprite = \"{}\"\n",
            config.sprite
        );
        fs::write(&config_path, contents)?;
        Ok(())
    }
}
