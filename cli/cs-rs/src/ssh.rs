use crate::error::{CsError, Result};
use crate::output;
use crate::sprite::SpriteClient;
use std::fs;
use std::path::PathBuf;

/// Sync local SSH keys to sprite for git clone
pub fn sync_keys(client: &SpriteClient) -> Result<()> {
    let home = dirs::home_dir().unwrap_or_else(|| PathBuf::from("~"));
    let ssh_dir = home.join(".ssh");

    // Find local SSH key
    let key_candidates = [
        "id_ed25519.pub",
        "id_rsa.pub",
        "id_ecdsa.pub",
    ];

    let pub_key_file = key_candidates
        .iter()
        .map(|name| ssh_dir.join(name))
        .find(|p| p.exists())
        .ok_or_else(|| {
            CsError::user(
                "No SSH public key found in ~/.ssh/. Generate one with: ssh-keygen -t ed25519",
            )
        })?;

    let pub_key = fs::read_to_string(&pub_key_file)?;
    let pub_key = pub_key.trim();

    output::info(&format!(
        "Syncing {} to {}...",
        pub_key_file.display(),
        client.name
    ));

    // Push public key to authorized_keys
    let script = r#"
mkdir -p ~/.ssh && chmod 700 ~/.ssh
touch ~/.ssh/authorized_keys && chmod 600 ~/.ssh/authorized_keys
if ! grep -qF "$PUB_KEY" ~/.ssh/authorized_keys 2>/dev/null; then
    echo "$PUB_KEY" >> ~/.ssh/authorized_keys
fi
"#;
    client.exec_script(script, &[("PUB_KEY", pub_key)])?;

    // Copy private key too so git works from within the sprite
    let priv_key_file = pub_key_file.with_extension("");
    if priv_key_file.exists() {
        output::info("Syncing private key...");
        let priv_key = fs::read_to_string(&priv_key_file)?;
        let priv_name = priv_key_file
            .file_name()
            .unwrap_or_default()
            .to_string_lossy()
            .to_string();
        let pub_name = pub_key_file
            .file_name()
            .unwrap_or_default()
            .to_string_lossy()
            .to_string();

        let script = r#"
mkdir -p ~/.ssh && chmod 700 ~/.ssh
echo "$PRIV_KEY" > ~/.ssh/$PRIV_NAME
chmod 600 ~/.ssh/$PRIV_NAME
echo "$PUB_KEY" > ~/.ssh/$PUB_NAME
chmod 644 ~/.ssh/$PUB_NAME
"#;
        client.exec_script(
            script,
            &[
                ("PRIV_KEY", priv_key.trim()),
                ("PRIV_NAME", &priv_name),
                ("PUB_KEY", pub_key),
                ("PUB_NAME", &pub_name),
            ],
        )?;
    }

    // Set up known_hosts
    output::info("Adding GitHub/GitLab to known_hosts...");
    client.exec(&[
        "bash",
        "-c",
        "mkdir -p ~/.ssh && ssh-keyscan -t ed25519 github.com >> ~/.ssh/known_hosts 2>/dev/null && ssh-keyscan -t ed25519 gitlab.com >> ~/.ssh/known_hosts 2>/dev/null && sort -u ~/.ssh/known_hosts -o ~/.ssh/known_hosts",
    ])?;

    output::info(&format!(
        "Done. You can now git clone via SSH inside {}.",
        client.name
    ));
    Ok(())
}
