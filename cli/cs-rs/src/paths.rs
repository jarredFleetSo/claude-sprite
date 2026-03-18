use std::path::{Path, PathBuf};
use std::process::Command;

/// Encode a path the way Claude does: replace / with -
/// e.g. /Users/jarredparrett/git/foo → -Users-jarredparrett-git-foo
pub fn encode_claude_path(path: &str) -> String {
    path.replace('/', "-")
}

/// Get the local project path (git root or cwd)
pub fn get_local_project_path() -> PathBuf {
    if let Ok(output) = Command::new("git")
        .args(["rev-parse", "--show-toplevel"])
        .output()
    {
        if output.status.success() {
            let s = String::from_utf8_lossy(&output.stdout).trim().to_string();
            if !s.is_empty() {
                return PathBuf::from(s);
            }
        }
    }
    std::env::current_dir().unwrap_or_else(|_| PathBuf::from("."))
}

/// Get the basename of the local project
pub fn project_basename() -> String {
    get_local_project_path()
        .file_name()
        .map(|n| n.to_string_lossy().to_string())
        .unwrap_or_else(|| "project".to_string())
}

/// Check if we're inside a git repository
pub fn is_git_repo(path: &Path) -> bool {
    Command::new("git")
        .args(["rev-parse", "--is-inside-work-tree"])
        .current_dir(path)
        .output()
        .map(|o| o.status.success())
        .unwrap_or(false)
}
