use crate::error::{CsError, Result};
use crate::output;
use crate::paths;
use crate::sprite::SpriteClient;
use indicatif::{ProgressBar, ProgressStyle};
use std::path::Path;
use std::process::{Command, Stdio};

/// Sync local directory to sprite via tar streaming
pub fn sync(client: &SpriteClient, local_path: &Path) -> Result<()> {
    let local_path = std::fs::canonicalize(local_path)
        .map_err(|_| CsError::user(format!("Local path not found: {}", local_path.display())))?;

    let dir_name = local_path
        .file_name()
        .map(|n| n.to_string_lossy().to_string())
        .unwrap_or_else(|| "project".to_string());

    let remote_dir = format!("~/{dir_name}");
    output::info(&format!(
        "{} {} {} {}:{}",
        output::ICON_SYNC,
        local_path.display(),
        console::style("→").dim(),
        console::style(&client.name).bold(),
        remote_dir
    ));

    if paths::is_git_repo(&local_path) {
        sync_git_tracked(client, &local_path, &dir_name)?;
    } else {
        sync_all_files(client, &local_path, &dir_name)?;
    }

    // Reset terminal in case sprite exec leaked control characters
    let _ = Command::new("stty").arg("sane").status();

    output::success(&format!(
        "Synced to ~/{dir_name} on {}",
        console::style(&client.name).bold()
    ));
    Ok(())
}

fn sync_git_tracked(client: &SpriteClient, local_path: &Path, dir_name: &str) -> Result<()> {
    // Count files for progress
    let file_count = Command::new("git")
        .args(["ls-files"])
        .current_dir(local_path)
        .output()
        .map(|o| {
            String::from_utf8_lossy(&o.stdout)
                .lines()
                .count()
        })
        .unwrap_or(0);

    let pb = ProgressBar::new(file_count as u64);
    pb.set_style(
        ProgressStyle::default_bar()
            .template("    {spinner:.cyan} [{bar:30.cyan/dim}] {pos}/{len} files")
            .unwrap()
            .progress_chars("━╸─"),
    );

    output::dim(&format!("  {file_count} tracked files"));

    // Create tar from git ls-files
    let git_ls = Command::new("git")
        .args(["ls-files", "-z"])
        .current_dir(local_path)
        .stdout(Stdio::piped())
        .spawn()?;

    let tar = Command::new("tar")
        .args(["-cf", "-", "--null", "-T", "-"])
        .current_dir(local_path)
        .stdin(git_ls.stdout.unwrap())
        .stdout(Stdio::piped())
        .spawn()?;

    let tar_stdout = tar.stdout.unwrap();
    let counting_reader = CountingReader::new(tar_stdout, pb.clone());

    let extract_cmd = format!("mkdir -p ~/{dir_name} && tar -xf - -C ~/{dir_name}");
    let result = client.exec_with_stdin(
        &["bash", "-c", &extract_cmd],
        counting_reader,
    );

    pb.finish_and_clear();
    result?;
    Ok(())
}

fn sync_all_files(client: &SpriteClient, local_path: &Path, dir_name: &str) -> Result<()> {
    output::info("No git repo detected. Syncing all files...");

    let parent = local_path.parent().unwrap_or(local_path);
    let tar = Command::new("tar")
        .args([
            "-cf", "-",
            "--exclude", ".git",
            "--exclude", "node_modules",
            "--exclude", "__pycache__",
            "--exclude", ".venv",
            "--exclude", "venv",
            "--exclude", ".env",
            "-C",
        ])
        .arg(parent)
        .arg(dir_name)
        .stdout(Stdio::piped())
        .spawn()?;

    let result = client.exec_with_stdin(
        &["tar", "-xf", "-", "-C", "~/"],
        tar.stdout.unwrap(),
    );

    result?;
    Ok(())
}

/// Pull files/directories from sprite to local
pub fn pull(
    client: &SpriteClient,
    remote_path: &str,
    local_dest: &Path,
) -> Result<()> {
    output::info(&format!(
        "{} {}:{} {} {}",
        output::ICON_PULL,
        console::style(&client.name).bold(),
        remote_path,
        console::style("→").dim(),
        local_dest.display()
    ));

    let script = r#"
path="$RPATH"
path="${path/#\~/$HOME}"
[ "${path:0:1}" != "/" ] && path="$HOME/$path"
if [ -d "$path" ]; then
    tar -cf - --exclude=".git" --exclude="node_modules" --exclude="__pycache__" \
        --exclude=".venv" --exclude="venv" -C "$(dirname "$path")" "$(basename "$path")"
elif [ -f "$path" ]; then
    tar -cf - -C "$(dirname "$path")" "$(basename "$path")"
else
    echo "ERROR: $path not found" >&2
    exit 1
fi
"#;

    let cmd = SpriteClient::build_remote_script(script, &[("RPATH", remote_path)]);
    let cmd_refs: Vec<&str> = cmd.iter().map(|s| s.as_str()).collect();

    let mut sprite_cmd = std::process::Command::new("sprite");
    sprite_cmd.arg("exec");
    sprite_cmd.arg("-s").arg(&client.name);
    if !client.org.is_empty() {
        sprite_cmd.arg("-o").arg(&client.org);
    }
    sprite_cmd.arg("--");
    for c in &cmd_refs {
        sprite_cmd.arg(c);
    }
    sprite_cmd.stdout(Stdio::piped());

    let child = sprite_cmd.spawn()?;

    let mut tar_extract = std::process::Command::new("tar");
    tar_extract
        .args(["-xf", "-", "-C"])
        .arg(local_dest)
        .stdin(child.stdout.unwrap());

    let status = tar_extract.status()?;
    if !status.success() {
        return Err(CsError::user("Failed to extract pulled files"));
    }

    let _ = Command::new("stty").arg("sane").status();
    output::info("Done.");
    Ok(())
}

/// A reader that counts bytes read (for progress bar)
struct CountingReader<R> {
    inner: R,
    pb: ProgressBar,
    bytes_read: u64,
}

impl<R> CountingReader<R> {
    fn new(inner: R, pb: ProgressBar) -> Self {
        Self {
            inner,
            pb,
            bytes_read: 0,
        }
    }
}

impl<R: std::io::Read> std::io::Read for CountingReader<R> {
    fn read(&mut self, buf: &mut [u8]) -> std::io::Result<usize> {
        let n = self.inner.read(buf)?;
        self.bytes_read += n as u64;
        // Approximate file count from bytes (rough heuristic)
        self.pb.set_position(self.bytes_read / 1024);
        Ok(n)
    }
}
