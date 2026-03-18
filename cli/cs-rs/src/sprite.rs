use crate::error::{CsError, Result};
use base64::Engine;
use std::io::Read;
use std::process::{Command, ExitStatus, Stdio};

/// Output from a sprite exec command
pub struct ExecOutput {
    pub stdout: String,
    #[allow(dead_code)]
    pub stderr: String,
    pub status: ExitStatus,
}

impl ExecOutput {
    pub fn success(&self) -> bool {
        self.status.success()
    }

    /// Return stdout trimmed, or error with stderr
    #[allow(dead_code)]
    pub fn stdout_or_err(&self) -> Result<String> {
        if self.success() {
            Ok(self.stdout.trim().to_string())
        } else {
            Err(CsError::ExecFailed {
                cmd: String::new(),
                stderr: self.stderr.clone(),
            })
        }
    }
}

/// Client for a specific sprite, wrapping `sprite exec -s NAME [-o ORG] -- <cmd>`
#[derive(Debug, Clone)]
pub struct SpriteClient {
    pub name: String,
    pub org: String,
    pub tmux_session: String,
}

impl SpriteClient {
    pub fn new(name: &str, org: &str, tmux_session: &str) -> Self {
        Self {
            name: name.to_string(),
            org: org.to_string(),
            tmux_session: tmux_session.to_string(),
        }
    }

    /// Build the base sprite command args: exec -s NAME [-o ORG]
    fn sprite_args(&self) -> Vec<String> {
        let mut args = vec!["-s".to_string(), self.name.clone()];
        if !self.org.is_empty() {
            args.push("-o".to_string());
            args.push(self.org.clone());
        }
        args
    }

    /// Require that the `sprite` CLI exists on PATH
    pub fn require_cli() -> Result<()> {
        which::which("sprite").map_err(|_| CsError::SpriteCliNotFound)?;
        Ok(())
    }

    /// Mode 1: Run command and capture output
    pub fn exec(&self, cmd: &[&str]) -> Result<ExecOutput> {
        let mut command = Command::new("sprite");
        command.arg("exec");
        for a in self.sprite_args() {
            command.arg(a);
        }
        command.arg("--");
        for c in cmd {
            command.arg(c);
        }
        command.stderr(Stdio::piped());
        command.stdout(Stdio::piped());

        let output = command.output()?;
        Ok(ExecOutput {
            stdout: String::from_utf8_lossy(&output.stdout).to_string(),
            stderr: String::from_utf8_lossy(&output.stderr).to_string(),
            status: output.status,
        })
    }

    /// Mode 2: Run command with stdin piped in (for tar streaming)
    /// Uses a writer thread to avoid pipe deadlock.
    pub fn exec_with_stdin<R: Read + Send + 'static>(
        &self,
        cmd: &[&str],
        mut stdin_reader: R,
    ) -> Result<ExecOutput> {
        let mut command = Command::new("sprite");
        command.arg("exec");
        for a in self.sprite_args() {
            command.arg(a);
        }
        command.arg("--");
        for c in cmd {
            command.arg(c);
        }
        command.stdin(Stdio::piped());
        command.stdout(Stdio::piped());
        command.stderr(Stdio::piped());

        let mut child = command.spawn()?;
        let mut child_stdin = child.stdin.take().expect("stdin was piped");

        // Writer thread to avoid deadlock
        let writer = std::thread::spawn(move || {
            let _ = std::io::copy(&mut stdin_reader, &mut child_stdin);
        });

        let output = child.wait_with_output()?;
        let _ = writer.join();

        Ok(ExecOutput {
            stdout: String::from_utf8_lossy(&output.stdout).to_string(),
            stderr: String::from_utf8_lossy(&output.stderr).to_string(),
            status: output.status,
        })
    }

    /// Mode 3: Replace process with sprite exec --tty (for attach, interactive)
    /// Uses Unix exec(), never returns on success.
    pub fn exec_tty(&self, cmd: &[&str]) -> Result<()> {
        self.exec_tty_with_env(cmd, &[])
    }

    /// Mode 3 with environment variable overrides
    pub fn exec_tty_with_env(&self, cmd: &[&str], env: &[(&str, &str)]) -> Result<()> {
        #[cfg(unix)]
        {
            use std::ffi::CString;
            use std::os::unix::ffi::OsStrExt;

            let mut args: Vec<String> = vec!["sprite".to_string(), "exec".to_string()];
            for a in self.sprite_args() {
                args.push(a);
            }
            args.push("--tty".to_string());
            args.push("--".to_string());
            for c in cmd {
                args.push(c.to_string());
            }

            // Apply environment overrides
            for (k, v) in env {
                std::env::set_var(k, v);
            }

            let sprite_path = which::which("sprite")
                .map_err(|_| CsError::SpriteCliNotFound)?;
            let c_path = CString::new(sprite_path.as_os_str().as_bytes())
                .map_err(|e| CsError::user(format!("Invalid path: {e}")))?;
            let c_args: Vec<CString> = args
                .iter()
                .map(|a| CString::new(a.as_bytes()).unwrap())
                .collect();

            nix_exec(&c_path, &c_args)?;
            unreachable!()
        }

        #[cfg(not(unix))]
        {
            let _ = (cmd, env);
            Err(CsError::user("exec_tty is only supported on Unix"))
        }
    }

    /// Run a remote bash script with base64-encoded variables for safe transport
    pub fn exec_script(&self, script: &str, vars: &[(&str, &str)]) -> Result<ExecOutput> {
        let cmd = Self::build_remote_script(script, vars);
        let cmd_refs: Vec<&str> = cmd.iter().map(|s| s.as_str()).collect();
        self.exec(&cmd_refs)
    }

    /// Build a bash -c command with base64-decoded variables
    pub fn build_remote_script(script: &str, vars: &[(&str, &str)]) -> Vec<String> {
        let mut preamble = String::new();
        for (k, v) in vars {
            let encoded = base64::engine::general_purpose::STANDARD.encode(v.as_bytes());
            preamble += &format!("{}=$(echo '{}' | base64 -d)\n", k, encoded);
        }
        vec![
            "bash".to_string(),
            "-c".to_string(),
            format!("{preamble}{script}"),
        ]
    }

    /// Check if the sprite is reachable
    pub fn is_reachable(&self) -> bool {
        self.exec(&["true"])
            .map(|o| o.success())
            .unwrap_or(false)
    }

    /// Ensure sprite is awake, returning error if not reachable
    pub fn ensure_awake(&self) -> Result<()> {
        crate::output::info(&format!("Ensuring sprite {} is awake...", self.name));
        if !self.is_reachable() {
            return Err(CsError::SpriteUnreachable {
                name: self.name.clone(),
            });
        }
        Ok(())
    }

    /// Get the remote project path on the sprite
    pub fn get_remote_project_path(&self, local_basename: &str) -> Result<String> {
        let script = r#"
for d in ~/*/; do
    [ -d "${d}.git" ] || continue
    if [ "$(basename "$d")" = "$BASENAME" ]; then
        cd "$d" && pwd
        exit 0
    fi
done
echo "$HOME/$BASENAME"
"#;
        let output = self.exec_script(script, &[("BASENAME", local_basename)])?;
        Ok(output.stdout.trim().to_string())
    }

    /// Sprite create command
    pub fn create(name: &str, org: &str) -> Result<()> {
        Self::require_cli()?;
        let mut cmd = Command::new("sprite");
        cmd.arg("create").arg("--skip-console");
        if !org.is_empty() {
            cmd.arg("-o").arg(org);
        }
        cmd.arg(name);

        let output = cmd.output()?;
        if !output.status.success() {
            return Err(CsError::ExecFailed {
                cmd: format!("sprite create {name}"),
                stderr: String::from_utf8_lossy(&output.stderr).to_string(),
            });
        }
        Ok(())
    }

    /// Sprite destroy command
    pub fn destroy(name: &str, org: &str) -> Result<()> {
        Self::require_cli()?;
        let mut cmd = Command::new("sprite");
        cmd.arg("destroy").arg("-s").arg(name);
        if !org.is_empty() {
            cmd.arg("-o").arg(org);
        }

        let output = cmd.output()?;
        if !output.status.success() {
            return Err(CsError::ExecFailed {
                cmd: format!("sprite destroy {name}"),
                stderr: String::from_utf8_lossy(&output.stderr).to_string(),
            });
        }
        Ok(())
    }

    /// Sprite stop command
    pub fn stop(name: &str, org: &str) -> Result<()> {
        Self::require_cli()?;
        let mut cmd = Command::new("sprite");
        cmd.arg("stop").arg("-s").arg(name);
        if !org.is_empty() {
            cmd.arg("-o").arg(org);
        }

        let output = cmd.output()?;
        if !output.status.success() {
            // Non-fatal — sprite may not support stop
            crate::output::warn("sprite stop not available — Sprite will idle automatically.");
        }
        Ok(())
    }
}

#[cfg(unix)]
fn nix_exec(path: &std::ffi::CString, args: &[std::ffi::CString]) -> Result<()> {
    use std::os::unix::process::CommandExt;

    let sprite_path_str = path.to_str()
        .map_err(|e| CsError::user(format!("Invalid path: {e}")))?;

    let mut cmd = Command::new(sprite_path_str);
    // Skip first arg (program name already set by Command::new)
    for arg in &args[1..] {
        cmd.arg(arg.to_str().unwrap_or(""));
    }

    let e = cmd.exec();
    Err(CsError::Io(e))
}
