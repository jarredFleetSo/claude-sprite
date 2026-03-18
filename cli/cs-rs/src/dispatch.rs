use crate::context;
use crate::error::{CsError, Result};
use crate::output;
use crate::paths;
use crate::sprite::SpriteClient;
use crate::sync;
use base64::Engine;
use console::style;

/// Check dispatch window status: "running", "done", or "none"
fn window_status(client: &SpriteClient) -> Result<String> {
    let script = r##"
session="$TMUX_SESSION"
if ! tmux list-windows -t "$session" -F "#{window_name}" 2>/dev/null | grep -qx "dispatch"; then
    echo "none"
    exit 0
fi
pane_pid=$(tmux list-panes -t "${session}:dispatch" -F "#{pane_pid}" 2>/dev/null | head -1)
if [ -z "$pane_pid" ]; then
    echo "none"
    exit 0
fi
if pgrep -P "$pane_pid" -f "claude" >/dev/null 2>&1; then
    echo "running"
elif [ -f "$HOME/.cs-dispatch/latest.log" ] && grep -q "DISPATCH_DONE" "$HOME/.cs-dispatch/latest.log" 2>/dev/null; then
    echo "done"
else
    echo "done"
fi
"##;
    let output = client.exec_script(script, &[("TMUX_SESSION", &client.tmux_session)])?;
    Ok(output.stdout.trim().to_string())
}

/// Show dispatch status
pub fn status(client: &SpriteClient) -> Result<()> {
    client.ensure_awake()?;
    let win_status = window_status(client)?;

    // Fetch metadata
    let meta = client
        .exec(&[
            "bash",
            "-c",
            r#"[ -f "$HOME/.cs-dispatch/latest.meta" ] && cat "$HOME/.cs-dispatch/latest.meta""#,
        ])
        .ok()
        .and_then(|o| {
            let s = o.stdout.trim().to_string();
            if s.is_empty() { None } else { Some(s) }
        });

    output::header(&format!("status → {}", client.name));

    match win_status.as_str() {
        "running" => {
            output::kv("state", style("● running").green().bold());
        }
        "done" => {
            output::kv("state", style("✓ done").cyan().bold());
        }
        _ => {
            output::kv("state", style("○ idle").dim());
        }
    }

    if let Some(meta) = meta {
        for line in meta.lines() {
            if let Some((k, v)) = line.split_once(':') {
                let k = k.trim();
                let v = v.trim();
                match k {
                    "prompt" => {
                        let display = if v.len() > 50 {
                            format!("{}…", &v[..50])
                        } else {
                            v.to_string()
                        };
                        output::kv("prompt", style(display).italic());
                    }
                    "project" => output::kv("project", v),
                    "started" => output::kv("started", v),
                    "mode" => output::kv("mode", v),
                    "command" => {
                        let display = if v.len() > 50 {
                            format!("{}…", &v[..50])
                        } else {
                            v.to_string()
                        };
                        output::kv("command", style(display).italic());
                    }
                    _ => {}
                }
            }
        }
    }

    output::footer();
    Ok(())
}

/// Attach to dispatch window
pub fn attach_dispatch(client: &SpriteClient) -> Result<()> {
    client.ensure_awake()?;
    let win_status = window_status(client)?;
    if win_status == "none" {
        return Err(CsError::user(format!(
            "No dispatch window found on {}",
            client.name
        )));
    }

    output::info(&format!(
        "Attaching to dispatch on {}...",
        style(&client.name).bold()
    ));

    let term = std::env::var("TERM").unwrap_or_else(|_| "xterm-256color".to_string());
    let fixed_term = term.replace("ghostty", "256color");

    let tmux_cmd = format!(
        "tmux attach-session -t {} \\; select-window -t dispatch",
        client.tmux_session
    );

    client.exec_tty_with_env(&["bash", "-c", &tmux_cmd], &[("TERM", &fixed_term)])
}

/// Tail dispatch log
pub fn logs(client: &SpriteClient) -> Result<()> {
    client.ensure_awake()?;

    let result = client.exec(&[
        "bash",
        "-c",
        r#"logfile="$HOME/.cs-dispatch/latest.log"; [ ! -f "$logfile" ] && echo "No dispatch log found." && exit 1; tail -100 "$logfile""#,
    ])?;

    if result.success() {
        print!("{}", result.stdout);
    } else {
        return Err(CsError::user("Failed to read dispatch log"));
    }
    Ok(())
}

/// Abort running dispatch
pub fn abort(client: &SpriteClient) -> Result<()> {
    client.ensure_awake()?;
    let win_status = window_status(client)?;
    if win_status == "none" {
        output::info(&format!("No dispatch running on {}", style(&client.name).bold()));
        return Ok(());
    }

    output::info(&format!("Aborting dispatch on {}...", style(&client.name).bold()));
    let script = format!(
        "tmux kill-window -t \"{}:dispatch\" 2>/dev/null || true",
        client.tmux_session
    );
    let _ = client.exec(&["bash", "-c", &script]);
    output::success("Dispatch aborted");
    Ok(())
}

/// Launch a new dispatch (Claude with prompt)
pub fn launch(
    client: &SpriteClient,
    prompt: Option<&str>,
    resume: bool,
    no_sync: bool,
    no_context: bool,
    force: bool,
) -> Result<()> {
    if prompt.is_none() && !resume {
        return Err(CsError::user(
            "Usage: cs dispatch \"<prompt>\" or cs dispatch --resume",
        ));
    }

    let total_steps: u8 = 2 + (!no_sync as u8) + (!no_context as u8);
    let mut current_step: u8 = 0;

    output::header(&format!("dispatch → {}", client.name));

    // 1. Wake sprite
    current_step += 1;
    output::step(current_step, total_steps, "Waking sprite...");
    client.ensure_awake()?;

    // 2. Check for existing dispatch
    let win_status = window_status(client)?;
    if win_status == "running" && !force {
        output::footer();
        return Err(CsError::user(format!(
            "A dispatch is already running. Use --force to replace it, or cs attach to watch it.",
        )));
    }
    if win_status != "none" && force {
        output::warn("Killing existing dispatch...");
        let script = format!(
            "tmux kill-window -t \"{}:dispatch\" 2>/dev/null || true",
            client.tmux_session
        );
        let _ = client.exec(&["bash", "-c", &script]);
    }

    // 3. Sync files
    if !no_sync {
        current_step += 1;
        output::step(current_step, total_steps, "Syncing files...");
        let local_path = paths::get_local_project_path();
        sync::sync(client, &local_path)?;
    }

    // 4. Push context
    if !no_context {
        current_step += 1;
        output::step(current_step, total_steps, "Pushing context...");
        context::push(client)?;
    }

    // 5. Build Claude command
    let basename = paths::project_basename();
    let remote_project = client.get_remote_project_path(&basename)?;

    let claude_cmd = if resume {
        let session_id = get_remote_session_id(client, &remote_project)?;
        output::info(&format!("Resuming session {}", style(&session_id).dim()));
        format!(
            "cd {remote_project} && claude --dangerously-skip-permissions --resume {session_id}"
        )
    } else {
        let prompt = prompt.unwrap();
        let encoded = base64::engine::general_purpose::STANDARD.encode(prompt.as_bytes());
        format!(
            "cd {remote_project} && claude --dangerously-skip-permissions -p \"$(echo '{encoded}' | base64 -d)\""
        )
    };

    // 6. Create metadata
    let meta_prompt = prompt.unwrap_or("<resume>");
    let meta_time = chrono::Utc::now().format("%Y-%m-%dT%H:%M:%SZ").to_string();
    let mode = if resume { "resume" } else { "new" };

    let meta_script = format!(
        r#"mkdir -p "$HOME/.cs-dispatch"
cat > "$HOME/.cs-dispatch/latest.meta" <<'METAEOF'
prompt: {meta_prompt}
project: {remote_project}
started: {meta_time}
mode: {mode}
METAEOF"#
    );
    let _ = client.exec(&["bash", "-c", &meta_script]);

    // 7. Launch in tmux
    current_step += 1;
    output::step(current_step, total_steps, "Launching...");

    let tmux_cmd = format!(
        "bash -c '{{ {claude_cmd}; }} 2>&1 | tee -a $HOME/.cs-dispatch/latest.log; echo DISPATCH_DONE >> $HOME/.cs-dispatch/latest.log; exec bash'"
    );
    let encoded_tmux = base64::engine::general_purpose::STANDARD.encode(tmux_cmd.as_bytes());

    let launch_script = format!(
        r#"
mkdir -p "$HOME/.cs-dispatch"
: > "$HOME/.cs-dispatch/latest.log"
decoded_cmd=$(echo '{encoded_tmux}' | base64 -d)
if ! tmux has-session -t "{tmux}" 2>/dev/null; then
    tmux new-session -d -s "{tmux}"
fi
tmux new-window -t "{tmux}" -n dispatch "$decoded_cmd"
"#,
        tmux = client.tmux_session
    );

    client
        .exec(&["bash", "-c", &launch_script])
        .map_err(|_| CsError::user("Failed to launch dispatch."))?;

    output::success("Dispatch launched!");
    output::footer();

    output::hint("status", "cs status");
    output::hint("watch ", "cs attach");
    output::hint("logs  ", "cs logs");
    output::hint("stop  ", "cs abort");
    output::hint("pull  ", "cs context pull");
    eprintln!();

    Ok(())
}

/// Run any command (not Claude) in tmux dispatch window
pub fn run_command(client: &SpriteClient, command: &str, force: bool) -> Result<()> {
    client.ensure_awake()?;

    let win_status = window_status(client)?;
    if win_status == "running" && !force {
        return Err(CsError::user(
            "A process is already running. Use --force to replace it, or cs attach to watch it.",
        ));
    }
    if win_status != "none" && force {
        output::warn("Killing existing dispatch...");
        let script = format!(
            "tmux kill-window -t \"{}:dispatch\" 2>/dev/null || true",
            client.tmux_session
        );
        let _ = client.exec(&["bash", "-c", &script]);
    }

    output::header(&format!("run → {}", client.name));

    let basename = paths::project_basename();
    let remote_project = client.get_remote_project_path(&basename)?;

    let encoded_cmd = base64::engine::general_purpose::STANDARD.encode(command.as_bytes());
    let tmux_cmd = format!(
        "bash -c 'cd {remote_project} && eval \"$(echo {encoded_cmd} | base64 -d)\"'"
    );
    let encoded_tmux = base64::engine::general_purpose::STANDARD.encode(tmux_cmd.as_bytes());

    let meta_time = chrono::Utc::now().format("%Y-%m-%dT%H:%M:%SZ").to_string();
    let launch_script = format!(
        r#"
mkdir -p "$HOME/.cs-dispatch"
cat > "$HOME/.cs-dispatch/latest.meta" <<'METAEOF'
command: {command}
project: {remote_project}
started: {meta_time}
mode: run
METAEOF
: > "$HOME/.cs-dispatch/latest.log"
decoded_cmd=$(echo '{encoded_tmux}' | base64 -d)
if ! tmux has-session -t "{tmux}" 2>/dev/null; then
    tmux new-session -d -s "{tmux}"
fi
tmux new-window -t "{tmux}" -n dispatch "$decoded_cmd"
"#,
        tmux = client.tmux_session
    );

    client
        .exec(&["bash", "-c", &launch_script])
        .map_err(|_| CsError::user("Failed to launch command."))?;

    output::success("Command launched!");
    output::footer();

    output::hint("status", "cs status");
    output::hint("watch ", "cs attach");
    output::hint("logs  ", "cs logs");
    output::hint("stop  ", "cs abort");
    eprintln!();

    Ok(())
}

fn get_remote_session_id(client: &SpriteClient, remote_project: &str) -> Result<String> {
    let script = r#"
history="$HOME/.claude/history.jsonl"
[ -f "$history" ] || exit 1
awk -F'"' -v project="$PROJECT" '
{
    pp=""; sid=""; ts=""
    for(i=1;i<=NF;i++) {
        if($i=="projectPath" || $i=="project_path") pp=$(i+2)
        if($i=="sessionId" || $i=="session_id") sid=$(i+2)
        if($i=="timestamp" || $i=="ts") ts=$(i+2)
    }
    if(pp==project && sid!="" && ts>max_ts) { max_ts=ts; max_sid=sid }
}
END { if(max_sid) print max_sid }
' "$history"
"#;
    let output = client.exec_script(script, &[("PROJECT", remote_project)])?;
    let session_id = output.stdout.trim().to_string();
    if session_id.is_empty() {
        return Err(CsError::user(format!(
            "No previous session found on {} for this project",
            client.name
        )));
    }
    Ok(session_id)
}
