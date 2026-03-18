use crate::error::Result;
use crate::output;
use crate::shell_setup;
use crate::sprite::SpriteClient;

/// Attach to sprite tmux session (replaces current process)
pub fn attach(client: &SpriteClient) -> Result<()> {
    output::info(&format!(
        "Attaching to tmux session '{}' on {}...",
        client.tmux_session, client.name
    ));

    // Best-effort session touch for dashboard
    let _ = client.exec(&[
        "curl",
        "-s",
        "-X",
        "POST",
        &format!(
            "http://localhost:8888/api/sessions/{}/touch",
            client.tmux_session
        ),
        "-d",
        "client=terminal",
    ]);

    // Ensure shell kit is installed (fast no-op after first run)
    shell_setup::setup(client)?;

    // Fix TERM for ghostty compatibility, then exec into tmux
    let term = std::env::var("TERM").unwrap_or_else(|_| "xterm-256color".to_string());
    let fixed_term = term.replace("ghostty", "256color");

    let tmux_cmd = format!(
        "tmux new-session -A -s {} \"exec zsh -l 2>/dev/null || exec bash -l\"",
        client.tmux_session
    );

    client.exec_tty_with_env(
        &["bash", "-c", &tmux_cmd],
        &[("TERM", &fixed_term)],
    )
}
