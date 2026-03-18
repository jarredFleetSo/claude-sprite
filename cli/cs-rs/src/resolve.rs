use crate::config::{GlobalConfig, ProjectConfig};
use crate::error::{CsError, Result};
use crate::picker;
use crate::sprite::SpriteClient;

/// Resolve a sprite name from: explicit arg → .cs.toml → global config → interactive picker
pub fn resolve_sprite(
    explicit: Option<&str>,
    config: &GlobalConfig,
) -> Result<SpriteClient> {
    let name = resolve_name(explicit, config)?;
    Ok(SpriteClient::new(&name, &config.org, &config.tmux_session))
}

/// Resolve just the sprite name (no client construction)
pub fn resolve_name(
    explicit: Option<&str>,
    config: &GlobalConfig,
) -> Result<String> {
    // 1. Explicit argument
    if let Some(name) = explicit {
        if !name.is_empty() {
            return Ok(name.to_string());
        }
    }

    // 2. Per-project .cs.toml
    if let Some(project_config) = ProjectConfig::find() {
        if !project_config.sprite.is_empty() {
            return Ok(project_config.sprite);
        }
    }

    // 3. Global config default
    if !config.sprite_name.is_empty() {
        return Ok(config.sprite_name.clone());
    }

    // 4. Interactive picker
    picker::pick_sprite(config)
}

/// Resolve sprite, failing hard if no name can be determined (no picker)
#[allow(dead_code)]
pub fn resolve_sprite_or_err(
    explicit: Option<&str>,
    config: &GlobalConfig,
) -> Result<SpriteClient> {
    let name = if let Some(name) = explicit {
        if !name.is_empty() {
            name.to_string()
        } else {
            return Err(CsError::NoSpriteName);
        }
    } else if let Some(project_config) = ProjectConfig::find() {
        if !project_config.sprite.is_empty() {
            project_config.sprite
        } else {
            config.sprite_name.clone()
        }
    } else if !config.sprite_name.is_empty() {
        config.sprite_name.clone()
    } else {
        return Err(CsError::NoSpriteName);
    };

    if name.is_empty() {
        return Err(CsError::NoSpriteName);
    }

    Ok(SpriteClient::new(&name, &config.org, &config.tmux_session))
}
