use thiserror::Error;

#[derive(Error, Debug)]
pub enum CsError {
    #[error("{0}")]
    User(String),

    #[error("sprite CLI not found. Install it from https://sprites.dev")]
    SpriteCliNotFound,

    #[error("sprite name required. Usage: cs <command> <sprite-name>")]
    #[allow(dead_code)]
    NoSpriteName,

    #[error("command failed: {cmd}\n{stderr}")]
    ExecFailed { cmd: String, stderr: String },

    #[error("sprite {name} is not reachable. Is it created?")]
    SpriteUnreachable { name: String },

    #[error(transparent)]
    Io(#[from] std::io::Error),

    #[error(transparent)]
    Json(#[from] serde_json::Error),

    #[error(transparent)]
    Toml(#[from] toml::de::Error),

    #[error(transparent)]
    Other(#[from] anyhow::Error),
}

pub type Result<T> = std::result::Result<T, CsError>;

impl CsError {
    pub fn user(msg: impl Into<String>) -> Self {
        CsError::User(msg.into())
    }
}
