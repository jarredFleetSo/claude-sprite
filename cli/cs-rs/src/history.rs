use serde::Deserialize;
use std::fs;
use std::path::Path;

#[derive(Debug, Deserialize)]
struct HistoryEntry {
    #[serde(alias = "projectPath", alias = "project_path", default)]
    project_path: String,
    #[serde(alias = "sessionId", alias = "session_id", default)]
    session_id: String,
    #[serde(alias = "ts", default)]
    timestamp: String,
}

/// Get the most recent session ID from history.jsonl for a given project path
pub fn get_latest_session_id(project_path: &str) -> Option<String> {
    let history_file = dirs::home_dir()?.join(".claude/history.jsonl");
    get_latest_session_id_from(&history_file, project_path)
}

pub fn get_latest_session_id_from(history_file: &Path, project_path: &str) -> Option<String> {
    let contents = fs::read_to_string(history_file).ok()?;

    let mut latest: Option<(String, String)> = None; // (session_id, timestamp)

    for line in contents.lines() {
        let line = line.trim();
        if line.is_empty() {
            continue;
        }
        let entry: HistoryEntry = match serde_json::from_str(line) {
            Ok(e) => e,
            Err(_) => continue,
        };
        if entry.project_path == project_path && !entry.session_id.is_empty() {
            match &latest {
                Some((_, ts)) if entry.timestamp > *ts => {
                    latest = Some((entry.session_id, entry.timestamp));
                }
                None => {
                    latest = Some((entry.session_id, entry.timestamp));
                }
                _ => {}
            }
        }
    }

    latest.map(|(sid, _)| sid)
}

/// Parse history.jsonl and return entries, optionally filtering by project path
pub fn parse_history(contents: &str) -> Vec<serde_json::Value> {
    contents
        .lines()
        .filter_map(|line| {
            let line = line.trim();
            if line.is_empty() {
                return None;
            }
            serde_json::from_str(line).ok()
        })
        .collect()
}

/// Rewrite project paths in history entries (for sync between local/remote)
pub fn rewrite_paths(
    entries: &[serde_json::Value],
    from: &str,
    to: &str,
) -> Vec<serde_json::Value> {
    entries
        .iter()
        .map(|entry| {
            let mut e = entry.clone();
            if let Some(obj) = e.as_object_mut() {
                for key in ["projectPath", "project_path"] {
                    if let Some(serde_json::Value::String(path)) = obj.get(key) {
                        if path == from {
                            obj.insert(key.to_string(), serde_json::Value::String(to.to_string()));
                        }
                    }
                }
            }
            e
        })
        .collect()
}

/// Merge two sets of history entries by session_id, deduplicating
#[allow(dead_code)]
pub fn merge_history(
    existing: &[serde_json::Value],
    new_entries: &[serde_json::Value],
) -> Vec<serde_json::Value> {
    let mut seen = std::collections::HashSet::new();
    let mut result = Vec::new();

    // Add existing entries first
    for entry in existing {
        let key = session_key(entry);
        if seen.insert(key) {
            result.push(entry.clone());
        }
    }

    // Add new entries that aren't duplicates
    for entry in new_entries {
        let key = session_key(entry);
        if seen.insert(key) {
            result.push(entry.clone());
        }
    }

    result
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
    format!("{sid}:{ts}")
}
