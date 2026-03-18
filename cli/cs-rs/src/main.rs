#[allow(dead_code)]
mod api;
mod attach;
mod auth;
mod cli;
mod config;
mod context;
mod dispatch;
mod error;
mod history;
#[allow(dead_code)]
mod output;
mod paths;
mod picker;
mod resolve;
mod shell_setup;
mod sprite;
mod ssh;
mod sync;

use clap::Parser;
use cli::{Cli, Commands, ContextAction};
use config::GlobalConfig;
use console::style;
use error::CsError;
use std::path::Path;
use std::process;

fn main() {
    let cli = Cli::parse();
    let config = GlobalConfig::load();

    let result = run(cli, &config);

    if let Err(e) = result {
        output::err(&e.to_string());
        process::exit(1);
    }
}

fn run(cli: Cli, config: &GlobalConfig) -> error::Result<()> {
    match cli.command {
        None => cmd_attach(None, config),

        Some(cmd) => match cmd {
            Commands::Attach { sprite } => cmd_attach(sprite.as_deref(), config),
            Commands::Ready { sprite } => cmd_ready(sprite.as_deref(), config),
            Commands::Sync { path, sprite } => cmd_sync(path.as_deref(), sprite.as_deref(), config),
            Commands::Pull {
                remote,
                local,
                sprite,
            } => cmd_pull(&remote, &local, sprite.as_deref(), config),
            Commands::Dispatch {
                prompt,
                resume,
                status,
                attach,
                log,
                abort,
                no_sync,
                no_context,
                force,
                sprite,
            } => {
                if status {
                    let client = resolve::resolve_sprite(sprite.as_deref(), config)?;
                    dispatch::status(&client)
                } else if attach {
                    let client = resolve::resolve_sprite(sprite.as_deref(), config)?;
                    dispatch::attach_dispatch(&client)
                } else if log {
                    let client = resolve::resolve_sprite(sprite.as_deref(), config)?;
                    dispatch::logs(&client)
                } else if abort {
                    let client = resolve::resolve_sprite(sprite.as_deref(), config)?;
                    dispatch::abort(&client)
                } else {
                    let client = resolve::resolve_sprite(sprite.as_deref(), config)?;
                    dispatch::launch(
                        &client,
                        prompt.as_deref(),
                        resume,
                        no_sync,
                        no_context,
                        force,
                    )
                }
            }
            Commands::Run {
                command,
                force,
                sprite,
            } => {
                let client = resolve::resolve_sprite(sprite.as_deref(), config)?;
                dispatch::run_command(&client, &command, force)
            }
            Commands::Status { sprite } => {
                let client = resolve::resolve_sprite(sprite.as_deref(), config)?;
                dispatch::status(&client)
            }
            Commands::Logs { sprite } => {
                let client = resolve::resolve_sprite(sprite.as_deref(), config)?;
                dispatch::logs(&client)
            }
            Commands::Abort { sprite } => {
                let client = resolve::resolve_sprite(sprite.as_deref(), config)?;
                dispatch::abort(&client)
            }
            Commands::List => cmd_list(config),
            Commands::Create { name } => cmd_create(name.as_deref(), config),
            Commands::Destroy { name } => cmd_destroy(name.as_deref(), config),
            Commands::Start { sprite } => cmd_start(sprite.as_deref(), config),
            Commands::Stop { sprite } => cmd_stop(sprite.as_deref(), config),
            Commands::Setup => cmd_setup(),
            Commands::Auth { sprite } => {
                let client = resolve::resolve_sprite(sprite.as_deref(), config)?;
                auth::push_api_key(&client, false)
            }
            Commands::SshKeys { sprite } => {
                let client = resolve::resolve_sprite(sprite.as_deref(), config)?;
                ssh::sync_keys(&client)
            }
            Commands::Context { action } => match action {
                ContextAction::Push { sprite } => {
                    let client = resolve::resolve_sprite(sprite.as_deref(), config)?;
                    context::push(&client)
                }
                ContextAction::Pull { sprite } => {
                    let client = resolve::resolve_sprite(sprite.as_deref(), config)?;
                    context::pull(&client)
                }
            },
            Commands::ShellSetup { sprite } => {
                let client = resolve::resolve_sprite(sprite.as_deref(), config)?;
                shell_setup::force_setup(&client)
            }
            Commands::Exec { cmd } => cmd_exec(&cmd, config),
            Commands::Clone { url, sprite } => cmd_clone(&url, sprite.as_deref(), config),
            Commands::Pick => cmd_pick(config),
            Commands::Share { port, sprite } => cmd_share(port, sprite.as_deref(), config),
            Commands::Proxy { ports } => cmd_proxy(ports.as_deref(), config),
            Commands::Url { sprite } => cmd_url(sprite.as_deref(), config),
            Commands::Web { port } => cmd_web(port),
        },
    }
}

fn cmd_attach(sprite: Option<&str>, config: &GlobalConfig) -> error::Result<()> {
    sprite::SpriteClient::require_cli()?;
    let client = resolve::resolve_sprite(sprite, config)?;
    attach::attach(&client)
}

fn cmd_ready(sprite: Option<&str>, config: &GlobalConfig) -> error::Result<()> {
    sprite::SpriteClient::require_cli()?;
    let client = resolve::resolve_sprite(sprite, config)?;

    output::header(&format!("ready → {}", client.name));

    // 1. Create sprite if it doesn't exist, otherwise wake it
    output::step(1, 5, "Connecting to sprite...");
    if !client.is_reachable() {
        output::info(&format!("Sprite '{}' not found — creating...", client.name));
        sprite::SpriteClient::create(&client.name, &client.org)?;
        output::info("Waiting for sprite to come online...");
        let mut retries = 0;
        while !client.is_reachable() {
            retries += 1;
            if retries > 30 {
                return Err(CsError::user(
                    "Sprite failed to become reachable after creation.",
                ));
            }
            std::thread::sleep(std::time::Duration::from_secs(2));
        }
        output::success("Sprite created and online");
    } else {
        output::success("Sprite is online");
    }

    // Auto-write .cs.toml
    if let Some(explicit) = sprite {
        if !explicit.is_empty() && config::ProjectConfig::find().is_none() {
            let _ = config::ProjectConfig::save(explicit);
            output::dim(&format!("  saved mapping → .cs.toml"));
        }
    }

    // 2. Ensure API key
    output::step(2, 5, "Checking auth...");
    auth::ensure_api_key(&client)?;

    // 3. Sync files
    output::step(3, 5, "Syncing files...");
    let local_path = paths::get_local_project_path();
    sync::sync(&client, &local_path)?;

    // 4. Push context
    output::step(4, 5, "Pushing context...");
    context::push(&client)?;

    // 5. Attach
    output::step(5, 5, "Attaching...");
    output::footer();
    attach::attach(&client)
}

fn cmd_sync(
    path: Option<&str>,
    sprite: Option<&str>,
    config: &GlobalConfig,
) -> error::Result<()> {
    sprite::SpriteClient::require_cli()?;
    let local_path = path.unwrap_or(".");
    let client = resolve::resolve_sprite(sprite, config)?;
    sync::sync(&client, Path::new(local_path))
}

fn cmd_pull(
    remote: &str,
    local: &str,
    sprite: Option<&str>,
    config: &GlobalConfig,
) -> error::Result<()> {
    sprite::SpriteClient::require_cli()?;
    let client = resolve::resolve_sprite(sprite, config)?;
    sync::pull(&client, remote, Path::new(local))
}

fn cmd_list(config: &GlobalConfig) -> error::Result<()> {
    let sprites = api::list_sprites(config)?;

    if sprites.is_empty() {
        output::warn("No sprites found.");
        return Ok(());
    }

    let width = 58;

    // ╭─ sprites ──────────────────────────────────────────────╮
    let title = " sprites ";
    let rest = width - title.len() - 3;
    eprintln!();
    eprintln!(
        "  {}{}{}{}{}",
        style("╭─").dim(),
        style(title).bold(),
        style("─".repeat(rest)).dim(),
        style("─").dim(),
        style("╮").dim(),
    );
    eprintln!(
        "  {}{}{}",
        style("│").dim(),
        " ".repeat(width - 2),
        style("│").dim(),
    );

    for s in &sprites {
        let status = output::format_status(&s.status, &s.last_active_at, &s.last_started_at);

        let name_width: usize = 20;
        let status_width: usize = 10;
        let name_pad = name_width.saturating_sub(s.name.len());
        let label_visible = console::measure_text_width(&status.label);
        let label_pad = status_width.saturating_sub(label_visible);

        let line_content = format!(
            "  {}{}  {} {}{}  {}",
            style(&s.name).bold(),
            " ".repeat(name_pad),
            status.icon,
            status.label,
            " ".repeat(label_pad),
            status.time_str,
        );

        let visible_len = console::measure_text_width(&line_content);
        let right_pad = (width - 2).saturating_sub(visible_len);

        eprintln!(
            "  {}{}{}{}",
            style("│").dim(),
            line_content,
            " ".repeat(right_pad),
            style("│").dim(),
        );
    }

    eprintln!(
        "  {}{}{}",
        style("│").dim(),
        " ".repeat(width - 2),
        style("│").dim(),
    );
    eprintln!(
        "  {}{}{}",
        style("╰").dim(),
        style("─".repeat(width - 2)).dim(),
        style("╯").dim(),
    );
    eprintln!();

    Ok(())
}

fn cmd_create(name: Option<&str>, config: &GlobalConfig) -> error::Result<()> {
    sprite::SpriteClient::require_cli()?;
    let name = if let Some(n) = name {
        n.to_string()
    } else {
        let term = console::Term::stderr();
        eprint!("  {} ", style("Sprite name:").bold());
        let n = term.read_line()?;
        let n = n.trim().to_string();
        if n.is_empty() {
            return Err(CsError::user("Sprite name required."));
        }
        n
    };

    output::info(&format!("Creating sprite '{name}'..."));
    sprite::SpriteClient::create(&name, &config.org)?;
    output::success(&format!("Created '{name}'"));
    Ok(())
}

fn cmd_destroy(name: Option<&str>, config: &GlobalConfig) -> error::Result<()> {
    sprite::SpriteClient::require_cli()?;
    let client = resolve::resolve_sprite(name, config)?;

    eprintln!();
    eprint!(
        "  {} sprite {}? This cannot be undone. [y/N] ",
        style("Destroy").red().bold(),
        style(&client.name).bold()
    );
    let term = console::Term::stderr();
    let confirm = term.read_line()?;
    if !matches!(confirm.trim(), "y" | "Y") {
        output::info("Cancelled.");
        return Ok(());
    }

    output::info(&format!("Destroying '{}'...", client.name));
    sprite::SpriteClient::destroy(&client.name, &client.org)?;
    output::success(&format!("Destroyed '{}'", client.name));
    Ok(())
}

fn cmd_start(sprite: Option<&str>, config: &GlobalConfig) -> error::Result<()> {
    sprite::SpriteClient::require_cli()?;
    let client = resolve::resolve_sprite(sprite, config)?;
    output::info(&format!("Waking {}...", style(&client.name).bold()));
    client.exec(&["echo", "Sprite is awake."])?;
    output::success("Sprite is awake");
    Ok(())
}

fn cmd_stop(sprite: Option<&str>, config: &GlobalConfig) -> error::Result<()> {
    sprite::SpriteClient::require_cli()?;
    let client = resolve::resolve_sprite(sprite, config)?;
    output::info(&format!("Checkpointing {}...", style(&client.name).bold()));
    sprite::SpriteClient::stop(&client.name, &client.org)?;
    output::success("Checkpointed");
    Ok(())
}

fn cmd_setup() -> error::Result<()> {
    use std::io::Write;

    let mut term = console::Term::stderr();
    let mut config = GlobalConfig::load();

    output::header("setup");
    output::boxline_empty();

    // Sprite token
    let token_display = if !config.sprite_token.is_empty() {
        format!(
            "{}...{}",
            &config.sprite_token[..config.sprite_token.len().min(8)],
            &config.sprite_token[config.sprite_token.len().saturating_sub(4)..]
        )
    } else {
        format!("{}", style("none").dim())
    };
    write!(
        term,
        "  {} Sprite API token [{}]: ",
        style("│").dim(),
        style(&token_display).cyan()
    )?;
    term.flush()?;
    let input = term.read_line()?;
    if !input.trim().is_empty() {
        config.sprite_token = input.trim().to_string();
    }

    // Sprite name
    let name_display = if config.sprite_name.is_empty() {
        format!("{}", style("picker").dim())
    } else {
        config.sprite_name.clone()
    };
    write!(
        term,
        "  {} Default sprite [{}]: ",
        style("│").dim(),
        style(&name_display).cyan()
    )?;
    term.flush()?;
    let input = term.read_line()?;
    if !input.trim().is_empty() {
        config.sprite_name = input.trim().to_string();
    }

    // Organization
    let org_display = if config.org.is_empty() {
        format!("{}", style("none").dim())
    } else {
        config.org.clone()
    };
    write!(
        term,
        "  {} Organization [{}]: ",
        style("│").dim(),
        style(&org_display).cyan()
    )?;
    term.flush()?;
    let input = term.read_line()?;
    if !input.trim().is_empty() {
        config.org = input.trim().to_string();
    }

    // tmux session
    write!(
        term,
        "  {} tmux session [{}]: ",
        style("│").dim(),
        style(&config.tmux_session).cyan()
    )?;
    term.flush()?;
    let input = term.read_line()?;
    if !input.trim().is_empty() {
        config.tmux_session = input.trim().to_string();
    }

    output::boxline_empty();
    output::footer();

    config.save()?;

    output::success("Setup complete");
    eprintln!();
    output::hint("attach", "cs");
    output::hint("list  ", "cs list");
    output::hint("sync  ", "cs ready <sprite>");
    eprintln!();

    Ok(())
}

fn cmd_exec(cmd: &[String], config: &GlobalConfig) -> error::Result<()> {
    sprite::SpriteClient::require_cli()?;
    if cmd.is_empty() {
        return Err(CsError::user("Usage: cs exec <command...>"));
    }
    let client = resolve::resolve_sprite(None, config)?;
    let cmd_refs: Vec<&str> = cmd.iter().map(|s| s.as_str()).collect();
    client.exec_tty(&cmd_refs)
}

fn cmd_clone(url: &str, sprite: Option<&str>, config: &GlobalConfig) -> error::Result<()> {
    sprite::SpriteClient::require_cli()?;
    let client = resolve::resolve_sprite(sprite, config)?;
    output::info(&format!("Cloning on {}...", style(&client.name).bold()));
    client.exec_tty(&["git", "clone", url])
}

fn cmd_pick(config: &GlobalConfig) -> error::Result<()> {
    sprite::SpriteClient::require_cli()?;
    let name = picker::pick_sprite(config)?;
    let client = sprite::SpriteClient::new(&name, &config.org, &config.tmux_session);
    attach::attach(&client)
}

fn cmd_share(port: u16, sprite: Option<&str>, config: &GlobalConfig) -> error::Result<()> {
    sprite::SpriteClient::require_cli()?;
    let client = resolve::resolve_sprite(sprite, config)?;

    let service = match port {
        7681 => "terminal",
        8080 => "editor",
        8888 => "dashboard",
        _ => "service",
    };

    output::header(&format!("share → {} ({})", client.name, service));
    output::boxline(&format!(
        "Starting cloudflared tunnel on port {} ...",
        style(port).cyan()
    ));
    output::footer();
    output::dim("  The public URL will appear below. Share it to access from any device.");
    output::dim("  Press ctrl-c to stop sharing.");
    eprintln!();

    // Install cloudflared if missing, then run quick tunnel
    let script = format!(
        r##"
if ! command -v cloudflared >/dev/null 2>&1; then
    echo "Installing cloudflared..."
    if command -v apt-get >/dev/null 2>&1; then
        curl -fsSL https://pkg.cloudflare.com/cloudflare-main.gpg | sudo tee /usr/share/keyrings/cloudflare-main.gpg >/dev/null
        echo "deb [signed-by=/usr/share/keyrings/cloudflare-main.gpg] https://pkg.cloudflare.com/cloudflared $(lsb_release -cs) main" | sudo tee /etc/apt/sources.list.d/cloudflared.list >/dev/null
        sudo apt-get update -qq && sudo apt-get install -y -qq cloudflared
    else
        curl -fsSL -o /tmp/cloudflared https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64
        chmod +x /tmp/cloudflared
        sudo mv /tmp/cloudflared /usr/local/bin/cloudflared
    fi
fi
cloudflared tunnel --url http://localhost:{port} 2>&1
"##
    );

    // Use exec_tty so the user sees the cloudflared output live (including the URL)
    client.exec_tty(&["bash", "-c", &script])
}

fn cmd_proxy(ports: Option<&str>, config: &GlobalConfig) -> error::Result<()> {
    sprite::SpriteClient::require_cli()?;
    let client = resolve::resolve_sprite(None, config)?;
    let ports = ports.unwrap_or("8888 7681 8080");

    output::header(&format!("proxy → {}", client.name));
    output::kv("dashboard", style("http://localhost:8888").cyan());
    output::kv("terminal", style("http://localhost:7681").cyan());
    output::kv("editor", style("http://localhost:8080").cyan());
    output::footer();
    output::dim("  press ctrl-c to stop");
    eprintln!();

    let mut cmd = std::process::Command::new("sprite");
    cmd.arg("proxy").arg("-s").arg(&client.name);
    if !client.org.is_empty() {
        cmd.arg("-o").arg(&client.org);
    }
    for port in ports.split_whitespace() {
        cmd.arg(port);
    }

    #[cfg(unix)]
    {
        use std::os::unix::process::CommandExt;
        let e = cmd.exec();
        return Err(error::CsError::Io(e));
    }

    #[cfg(not(unix))]
    {
        let status = cmd.status()?;
        if !status.success() {
            return Err(CsError::user("Proxy failed"));
        }
        Ok(())
    }
}

fn cmd_url(sprite: Option<&str>, config: &GlobalConfig) -> error::Result<()> {
    sprite::SpriteClient::require_cli()?;
    let client = resolve::resolve_sprite(sprite, config)?;

    let result = client.exec(&[
        "bash", "-c",
        r#"
if [ -f /etc/default/workspace ]; then . /etc/default/workspace; fi
echo "${TERM_HOSTNAME:-}"
echo "${CODE_HOSTNAME:-}"
echo "${DASH_HOSTNAME:-}"
"#,
    ])?;

    let lines: Vec<&str> = result.stdout.trim().lines().collect();

    output::header(&format!("urls → {}", client.name));

    if lines.len() >= 1 && !lines[0].is_empty() {
        output::kv("terminal", style(format!("https://{}", lines[0])).cyan());
    }
    if lines.len() >= 2 && !lines[1].is_empty() {
        output::kv("editor", style(format!("https://{}", lines[1])).cyan());
    }
    if lines.len() >= 3 && !lines[2].is_empty() {
        output::kv("dashboard", style(format!("https://{}", lines[2])).cyan());
    }

    output::divider();
    output::kv("dashboard", style("http://localhost:8888").dim());
    output::kv("terminal", style("http://localhost:7681").dim());
    output::kv("editor", style("http://localhost:8080").dim());
    output::footer();

    Ok(())
}

fn cmd_web(port: Option<u16>) -> error::Result<()> {
    let port = port.unwrap_or(8888);
    let exe_path = std::env::current_exe()?;
    let script_dir = exe_path.parent().unwrap_or(Path::new("."));
    let app_candidates = [
        script_dir.join("../../app/server.py"),
        script_dir.join("../../../app/server.py"),
        Path::new("app/server.py").to_path_buf(),
    ];

    let app_path = app_candidates
        .iter()
        .find(|p| p.exists())
        .ok_or_else(|| CsError::user("Cannot find app/server.py"))?;

    output::info(&format!(
        "Starting dashboard → {}",
        style(format!("http://localhost:{port}")).cyan()
    ));

    let _browser = std::thread::spawn(move || {
        std::thread::sleep(std::time::Duration::from_secs(1));
        let _ = std::process::Command::new("open")
            .arg(format!("http://localhost:{port}"))
            .status();
    });

    #[cfg(unix)]
    {
        use std::os::unix::process::CommandExt;
        let e = std::process::Command::new("python3")
            .arg(app_path)
            .env("WEBAPP_PORT", port.to_string())
            .exec();
        return Err(error::CsError::Io(e));
    }

    #[cfg(not(unix))]
    {
        let _status = std::process::Command::new("python3")
            .arg(app_path)
            .env("WEBAPP_PORT", port.to_string())
            .status()?;
        Ok(())
    }
}
