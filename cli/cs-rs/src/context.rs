use crate::error::Result;
use crate::history;
use crate::output;
use crate::paths;
use crate::sprite::SpriteClient;
use std::fs;
use std::path::PathBuf;
use std::process::{Command, Stdio};

/// Push Claude context (sessions, history, settings) to sprite
pub fn push(client: &SpriteClient) -> Result<()> {
    let local_project = paths::get_local_project_path();
    let local_project_str = local_project.to_string_lossy().to_string();
    let local_encoded = paths::encode_claude_path(&local_project_str);
    let local_claude_dir = dirs::home_dir()
        .unwrap_or_default()
        .join(".claude/projects")
        .join(&local_encoded);

    output::info(&format!("Local project: {local_project_str}"));

    let basename = paths::project_basename();
    let remote_project = client.get_remote_project_path(&basename)?;
    let remote_encoded = paths::encode_claude_path(&remote_project);

    output::info(&format!("Remote project: {remote_project}"));

    // 1. Push session transcripts (5 most recent)
    push_sessions(client, &local_claude_dir, &remote_encoded)?;

    // 2. Merge history entries
    push_history(client, &local_project_str, &remote_project)?;

    // 3. Push project settings (.claude/ dir and CLAUDE.md)
    push_project_settings(client, &local_project, &remote_project)?;

    // 4. Ensure Claude onboarding is complete
    ensure_onboarding(client)?;

    let _ = Command::new("stty").arg("sane").status();

    // 5. Print latest session ID
    if let Some(session_id) = history::get_latest_session_id(&local_project_str) {
        eprintln!();
        output::info("Context pushed successfully.");
        output::info(&format!("Most recent session: {session_id}"));
        eprintln!();
        eprintln!("  claude --resume {session_id}");
        eprintln!();
    } else {
        eprintln!();
        output::info("Context pushed successfully.");
    }

    Ok(())
}

/// Pull Claude context from sprite to local
pub fn pull(client: &SpriteClient) -> Result<()> {
    let local_project = paths::get_local_project_path();
    let local_project_str = local_project.to_string_lossy().to_string();
    let local_encoded = paths::encode_claude_path(&local_project_str);
    let local_claude_dir = dirs::home_dir()
        .unwrap_or_default()
        .join(".claude/projects")
        .join(&local_encoded);

    output::info(&format!("Local project: {local_project_str}"));

    let basename = paths::project_basename();
    let remote_project = client.get_remote_project_path(&basename)?;
    let remote_encoded = paths::encode_claude_path(&remote_project);

    output::info(&format!("Remote project: {remote_project}"));

    // 1. Pull session transcripts
    pull_sessions(client, &local_claude_dir, &local_encoded, &remote_encoded)?;

    // 2. Merge history entries
    pull_history(client, &local_project_str, &remote_project)?;

    // 3. Pull project settings
    pull_project_settings(client, &local_project, &remote_project)?;

    let _ = Command::new("stty").arg("sane").status();

    // 4. Print latest session ID
    if let Some(session_id) = history::get_latest_session_id(&local_project_str) {
        eprintln!();
        output::info("Context pulled successfully.");
        output::info(&format!("Most recent session: {session_id}"));
        eprintln!();
        eprintln!("  claude --resume {session_id}");
        eprintln!();
    } else {
        eprintln!();
        output::info("Context pulled successfully.");
    }

    Ok(())
}

fn push_sessions(
    client: &SpriteClient,
    local_claude_dir: &PathBuf,
    remote_encoded: &str,
) -> Result<()> {
    if !local_claude_dir.is_dir() {
        output::warn(&format!(
            "No session transcripts found at {}",
            local_claude_dir.display()
        ));
        return Ok(());
    }

    output::info("Pushing session transcripts...");

    // Get 5 most recent session directories by modification time
    let mut entries: Vec<_> = fs::read_dir(local_claude_dir)?
        .filter_map(|e| e.ok())
        .filter(|e| e.file_type().map(|t| t.is_dir()).unwrap_or(false))
        .collect();

    entries.sort_by(|a, b| {
        let a_time = a.metadata().and_then(|m| m.modified()).unwrap_or(std::time::SystemTime::UNIX_EPOCH);
        let b_time = b.metadata().and_then(|m| m.modified()).unwrap_or(std::time::SystemTime::UNIX_EPOCH);
        b_time.cmp(&a_time)
    });

    let recent: Vec<String> = entries
        .iter()
        .take(5)
        .filter_map(|e| e.file_name().to_str().map(|s| s.to_string()))
        .collect();

    if recent.is_empty() {
        return Ok(());
    }

    // Build tar of recent sessions
    let mut tar_cmd = Command::new("tar");
    tar_cmd.args(["-cf", "-"]);
    tar_cmd.arg("-C").arg(local_claude_dir);
    for dir in &recent {
        tar_cmd.arg(dir);
    }
    tar_cmd.stdout(Stdio::piped());

    let tar = tar_cmd.spawn()?;

    let extract_script = format!(
        "mkdir -p ~/.claude/projects/{remote_encoded} && tar -xf - -C ~/.claude/projects/{remote_encoded}"
    );
    let result = client.exec_with_stdin(
        &["bash", "-c", &extract_script],
        tar.stdout.unwrap(),
    );

    match result {
        Ok(_) => {}
        Err(_) => output::warn("Failed to push session transcripts (non-fatal)"),
    }

    Ok(())
}

fn push_history(
    client: &SpriteClient,
    local_project: &str,
    remote_project: &str,
) -> Result<()> {
    let history_path = dirs::home_dir()
        .unwrap_or_default()
        .join(".claude/history.jsonl");

    if !history_path.exists() {
        output::warn("No history.jsonl found");
        return Ok(());
    }

    output::info("Merging history entries...");

    let contents = fs::read_to_string(&history_path)?;
    let entries = history::parse_history(&contents);

    // Filter for this project and rewrite paths
    let project_entries: Vec<serde_json::Value> = entries
        .into_iter()
        .filter(|e| {
            let ep = e
                .get("projectPath")
                .or_else(|| e.get("project_path"))
                .and_then(|v| v.as_str())
                .unwrap_or("");
            ep == local_project
        })
        .collect();

    let remapped = history::rewrite_paths(&project_entries, local_project, remote_project);

    if remapped.is_empty() {
        return Ok(());
    }

    // Send remapped entries as JSONL to the remote merge script
    let mut jsonl = String::new();
    for entry in &remapped {
        jsonl += &serde_json::to_string(entry).unwrap_or_default();
        jsonl += "\n";
    }

    // Use a remote script that deduplicates and appends
    let merge_script = r#"
mkdir -p ~/.claude
# Read existing session keys
declare -A seen
if [ -f ~/.claude/history.jsonl ]; then
    while IFS= read -r line; do
        [ -z "$line" ] && continue
        key=$(echo "$line" | sed -n 's/.*"sessionId":"\([^"]*\)".*"timestamp":"\([^"]*\)".*/\1:\2/p')
        [ -z "$key" ] && key=$(echo "$line" | sed -n 's/.*"session_id":"\([^"]*\)".*"ts":"\([^"]*\)".*/\1:\2/p')
        [ -n "$key" ] && seen["$key"]=1
    done < ~/.claude/history.jsonl
fi
# Append new unique entries
added=0
while IFS= read -r line; do
    [ -z "$line" ] && continue
    key=$(echo "$line" | sed -n 's/.*"sessionId":"\([^"]*\)".*"timestamp":"\([^"]*\)".*/\1:\2/p')
    [ -z "$key" ] && key=$(echo "$line" | sed -n 's/.*"session_id":"\([^"]*\)".*"ts":"\([^"]*\)".*/\1:\2/p')
    if [ -n "$key" ] && [ -z "${seen[$key]:-}" ]; then
        echo "$line" >> ~/.claude/history.jsonl
        seen["$key"]=1
        added=$((added + 1))
    fi
done
echo "$added history entries added"
"#;

    let result = client.exec_with_stdin(
        &["bash", "-c", merge_script],
        std::io::Cursor::new(jsonl.into_bytes()),
    );

    match result {
        Ok(o) => {
            let msg = o.stdout.trim();
            if !msg.is_empty() {
                output::info(msg);
            }
        }
        Err(_) => output::warn("Failed to merge history (non-fatal)"),
    }

    Ok(())
}

fn push_project_settings(
    client: &SpriteClient,
    local_project: &PathBuf,
    remote_project: &str,
) -> Result<()> {
    let claude_dir = local_project.join(".claude");
    let claude_md = local_project.join("CLAUDE.md");

    if !claude_dir.is_dir() && !claude_md.is_file() {
        return Ok(());
    }

    output::info("Pushing project settings...");

    let mut tar_cmd = Command::new("tar");
    tar_cmd.args(["-cf", "-"]);
    tar_cmd.args(["--exclude", ".claude/worktrees"]);
    tar_cmd.args(["--exclude", ".claude/statsig"]);
    tar_cmd.args(["--exclude", ".claude/todos"]);

    if claude_dir.is_dir() {
        tar_cmd.arg("-C").arg(local_project).arg(".claude");
    }
    if claude_md.is_file() {
        tar_cmd.arg("-C").arg(local_project).arg("CLAUDE.md");
    }

    tar_cmd.stdout(Stdio::piped());
    let tar = tar_cmd.spawn()?;

    let extract_script = format!(
        "mkdir -p {remote_project} && tar -xf - -C {remote_project}"
    );

    let result = client.exec_with_stdin(
        &["bash", "-c", &extract_script],
        tar.stdout.unwrap(),
    );

    match result {
        Ok(_) => {}
        Err(_) => output::warn("Failed to push project settings (non-fatal)"),
    }

    Ok(())
}

fn ensure_onboarding(client: &SpriteClient) -> Result<()> {
    output::info("Ensuring Claude is ready (onboarding)...");

    // Use jq for robust JSON manipulation (available on most sprites).
    // Falls back to a node/python one-liner if jq isn't available.
    // Key: must set hasCompletedOnboarding, lastOnboardingVersion,
    // AND hasTrustDialogAccepted for every entry in .projects
    let script = r#"
config="$HOME/.claude.json"

# Bootstrap if missing
if [ ! -f "$config" ]; then
    echo '{"hasCompletedOnboarding":true,"lastOnboardingVersion":"99.0.0"}' > "$config"
    echo "Created .claude.json with onboarding flags"
    exit 0
fi

# Try jq first (most reliable)
if command -v jq >/dev/null 2>&1; then
    tmp=$(mktemp)
    jq '
      .hasCompletedOnboarding = true |
      .lastOnboardingVersion = "99.0.0" |
      if .projects then
        .projects |= with_entries(.value.hasTrustDialogAccepted = true)
      else . end
    ' "$config" > "$tmp" 2>/dev/null && mv "$tmp" "$config" && echo "Onboarding set (jq)" && exit 0
    rm -f "$tmp"
fi

# Fallback: node (often available on dev machines)
if command -v node >/dev/null 2>&1; then
    node -e "
const fs = require('fs');
const p = process.env.HOME + '/.claude.json';
let d = {};
try { d = JSON.parse(fs.readFileSync(p, 'utf8')); } catch(e) {}
d.hasCompletedOnboarding = true;
d.lastOnboardingVersion = '99.0.0';
if (d.projects) { for (const k of Object.keys(d.projects)) { d.projects[k].hasTrustDialogAccepted = true; } }
fs.writeFileSync(p, JSON.stringify(d, null, 2));
" && echo "Onboarding set (node)" && exit 0
fi

# Fallback: python3
if command -v python3 >/dev/null 2>&1; then
    python3 -c "
import json, os
path = os.path.expanduser('~/.claude.json')
data = {}
if os.path.exists(path):
    with open(path) as f: data = json.load(f)
data['hasCompletedOnboarding'] = True
data['lastOnboardingVersion'] = '99.0.0'
for proj in data.get('projects', {}):
    data['projects'][proj]['hasTrustDialogAccepted'] = True
with open(path, 'w') as f: json.dump(data, f, indent=2)
" && echo "Onboarding set (python3)" && exit 0
fi

# Last resort: sed (doesn't handle projects trust dialogs)
tmp=$(mktemp)
sed -e 's/"hasCompletedOnboarding":\s*false/"hasCompletedOnboarding": true/g' "$config" > "$tmp"
if ! grep -q '"hasCompletedOnboarding"' "$tmp"; then
    sed -i 's/^{/{"hasCompletedOnboarding":true,"lastOnboardingVersion":"99.0.0",/' "$tmp"
fi
mv "$tmp" "$config"
echo "Onboarding set (sed fallback)"
"#;

    match client.exec(&["bash", "-c", script]) {
        Ok(o) => {
            let msg = o.stdout.trim();
            if !msg.is_empty() {
                output::info(msg);
            }
        }
        Err(_) => output::warn("Failed to set onboarding flags (non-fatal)"),
    }

    Ok(())
}

fn pull_sessions(
    client: &SpriteClient,
    local_claude_dir: &PathBuf,
    local_encoded: &str,
    remote_encoded: &str,
) -> Result<()> {
    output::info("Pulling session transcripts...");

    let projects_dir = dirs::home_dir()
        .unwrap_or_default()
        .join(".claude/projects");
    fs::create_dir_all(&projects_dir)?;

    let script = format!(
        r#"
dir="$HOME/.claude/projects/{remote_encoded}"
if [ -d "$dir" ]; then
    tar -cf - -C "$HOME/.claude/projects" "{remote_encoded}"
else
    echo "NO_SESSIONS" >&2
    tar -cf - --files-from /dev/null
fi
"#
    );

    let mut sprite_cmd = Command::new("sprite");
    sprite_cmd.arg("exec");
    sprite_cmd.arg("-s").arg(&client.name);
    if !client.org.is_empty() {
        sprite_cmd.arg("-o").arg(&client.org);
    }
    sprite_cmd.arg("--");
    sprite_cmd.args(["bash", "-c", &script]);
    sprite_cmd.stdout(Stdio::piped());

    let child = sprite_cmd.spawn()?;

    let mut tar_extract = Command::new("tar");
    tar_extract
        .args(["-xf", "-", "-C"])
        .arg(&projects_dir)
        .stdin(child.stdout.unwrap());

    let _ = tar_extract.status();

    // Rename remote-encoded dir to local-encoded if different
    if remote_encoded != local_encoded {
        let extracted = projects_dir.join(remote_encoded);
        if extracted.is_dir() {
            if local_claude_dir.is_dir() {
                // Merge into existing
                let _ = copy_dir_contents(&extracted, local_claude_dir);
            } else {
                let _ = fs::rename(&extracted, local_claude_dir);
            }
            let _ = fs::remove_dir_all(&extracted);
        }
    }

    Ok(())
}

fn pull_history(
    client: &SpriteClient,
    local_project: &str,
    remote_project: &str,
) -> Result<()> {
    output::info("Merging history entries...");

    // Fetch remote history
    let result = client.exec(&["bash", "-c", "[ -f ~/.claude/history.jsonl ] && cat ~/.claude/history.jsonl"]);

    let remote_contents = match result {
        Ok(o) => o.stdout,
        Err(_) => return Ok(()),
    };

    let remote_entries = history::parse_history(&remote_contents);

    // Filter for this project
    let project_entries: Vec<serde_json::Value> = remote_entries
        .into_iter()
        .filter(|e| {
            let ep = e
                .get("projectPath")
                .or_else(|| e.get("project_path"))
                .and_then(|v| v.as_str())
                .unwrap_or("");
            ep == remote_project
        })
        .collect();

    // Rewrite paths to local
    let remapped = history::rewrite_paths(&project_entries, remote_project, local_project);

    if remapped.is_empty() {
        return Ok(());
    }

    // Merge with existing local history
    let history_path = dirs::home_dir()
        .unwrap_or_default()
        .join(".claude/history.jsonl");

    let existing = if history_path.exists() {
        history::parse_history(&fs::read_to_string(&history_path).unwrap_or_default())
    } else {
        vec![]
    };

    // Append only new entries
    let mut existing_keys = std::collections::HashSet::new();
    for entry in &existing {
        existing_keys.insert(session_key(entry));
    }

    let mut appended = 0;
    let mut append_str = String::new();
    for entry in &remapped {
        let key = session_key(entry);
        if !key.is_empty() && existing_keys.insert(key) {
            append_str += &serde_json::to_string(entry).unwrap_or_default();
            append_str += "\n";
            appended += 1;
        }
    }

    if appended > 0 {
        use std::io::Write;
        let mut file = fs::OpenOptions::new()
            .create(true)
            .append(true)
            .open(&history_path)?;
        file.write_all(append_str.as_bytes())?;
    }

    output::info(&format!("{appended} history entries pulled"));
    Ok(())
}

fn pull_project_settings(
    client: &SpriteClient,
    local_project: &PathBuf,
    remote_project: &str,
) -> Result<()> {
    output::info("Pulling project settings...");

    let script = format!(
        r#"
tar_args=()
has_files=""
if [ -d "{remote_project}/.claude" ]; then
    tar_args+=(-C "{remote_project}" ".claude")
    has_files="1"
fi
if [ -f "{remote_project}/CLAUDE.md" ]; then
    tar_args+=(-C "{remote_project}" "CLAUDE.md")
    has_files="1"
fi
if [ -n "$has_files" ]; then
    tar -cf - "${{tar_args[@]}}"
else
    tar -cf - --files-from /dev/null
fi
"#
    );

    let mut sprite_cmd = Command::new("sprite");
    sprite_cmd.arg("exec");
    sprite_cmd.arg("-s").arg(&client.name);
    if !client.org.is_empty() {
        sprite_cmd.arg("-o").arg(&client.org);
    }
    sprite_cmd.arg("--");
    sprite_cmd.args(["bash", "-c", &script]);
    sprite_cmd.stdout(Stdio::piped());

    let child = sprite_cmd.spawn()?;

    let mut tar_extract = Command::new("tar");
    tar_extract
        .args(["-xf", "-", "-C"])
        .arg(local_project)
        .stdin(child.stdout.unwrap());

    let _ = tar_extract.status();
    Ok(())
}

fn session_key(entry: &serde_json::Value) -> String {
    let sid = entry
        .get("sessionId")
        .or_else(|| entry.get("session_id"))
        .and_then(|v| v.as_str())
        .unwrap_or("");
    let ts = entry
        .get("timestamp")
        .or_else(|| entry.get("ts"))
        .and_then(|v| v.as_str())
        .unwrap_or("");
    if sid.is_empty() || ts.is_empty() {
        return String::new();
    }
    format!("{sid}:{ts}")
}

fn copy_dir_contents(src: &PathBuf, dst: &PathBuf) -> Result<()> {
    fs::create_dir_all(dst)?;
    for entry in fs::read_dir(src)? {
        let entry = entry?;
        let dest_path = dst.join(entry.file_name());
        if entry.file_type()?.is_dir() {
            copy_dir_contents(&entry.path(), &dest_path)?;
        } else {
            fs::copy(entry.path(), dest_path)?;
        }
    }
    Ok(())
}
