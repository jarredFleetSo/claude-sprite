use clap::{Parser, Subcommand};

#[derive(Parser)]
#[command(
    name = "cs",
    about = "Claude Sprite CLI — manage remote Claude Code environments",
    version,
    arg_required_else_help = false
)]
pub struct Cli {
    #[command(subcommand)]
    pub command: Option<Commands>,
}

#[derive(Subcommand)]
pub enum Commands {
    /// Connect to sprite terminal (default if no command given)
    Attach {
        /// Sprite name
        sprite: Option<String>,
    },

    /// THE command: create → auth → sync → context → attach
    Ready {
        /// Sprite name
        sprite: Option<String>,
    },

    /// Sync local project files to sprite
    #[command(alias = "push")]
    Sync {
        /// Local path to sync (default: current directory)
        path: Option<String>,
        /// Sprite name
        sprite: Option<String>,
    },

    /// Pull files/artifacts from sprite
    Pull {
        /// Remote path to pull
        remote: String,
        /// Local destination (default: current directory)
        #[arg(default_value = ".")]
        local: String,
        /// Sprite name
        sprite: Option<String>,
    },

    /// Fire-and-forget Claude tasks on sprites
    Dispatch {
        /// Prompt for Claude
        prompt: Option<String>,
        /// Resume the latest session
        #[arg(long)]
        resume: bool,
        /// Check dispatch status
        #[arg(long)]
        status: bool,
        /// Reconnect to watch dispatch live
        #[arg(long)]
        attach: bool,
        /// Tail the output log
        #[arg(long)]
        log: bool,
        /// Kill the running dispatch
        #[arg(long)]
        abort: bool,
        /// Skip file sync
        #[arg(long)]
        no_sync: bool,
        /// Skip context push
        #[arg(long)]
        no_context: bool,
        /// Replace a running dispatch
        #[arg(long)]
        force: bool,
        /// Sprite name (positional, after prompt)
        sprite: Option<String>,
    },

    /// Run any command in tmux on sprite (not Claude-wrapped)
    Run {
        /// Command to run
        command: String,
        /// Replace a running process
        #[arg(long)]
        force: bool,
        /// Sprite name
        sprite: Option<String>,
    },

    /// Check what's running on sprite (dispatch, run, or nothing)
    Status {
        /// Sprite name
        sprite: Option<String>,
    },

    /// Tail output of whatever's running
    Logs {
        /// Sprite name
        sprite: Option<String>,
    },

    /// Kill the running dispatch/run
    Abort {
        /// Sprite name
        sprite: Option<String>,
    },

    /// List all sprites with status
    #[command(alias = "ls")]
    List,

    /// Create a new sprite
    #[command(alias = "new")]
    Create {
        /// Sprite name
        name: Option<String>,
    },

    /// Destroy a sprite
    #[command(alias = "rm")]
    Destroy {
        /// Sprite name
        name: Option<String>,
    },

    /// Wake the Sprite VM
    Start {
        /// Sprite name
        sprite: Option<String>,
    },

    /// Checkpoint and idle the Sprite VM
    Stop {
        /// Sprite name
        sprite: Option<String>,
    },

    /// First-time configuration wizard
    Setup,

    /// Set up Claude Code auth on a sprite
    Auth {
        /// Sprite name
        sprite: Option<String>,
    },

    /// Sync local SSH keys to sprite for git clone
    SshKeys {
        /// Sprite name
        sprite: Option<String>,
    },

    /// Push/pull Claude context (sessions, history, settings)
    Context {
        #[command(subcommand)]
        action: ContextAction,
    },

    /// Install shell environment (starship, fzf, eza, etc.)
    ShellSetup {
        /// Sprite name
        sprite: Option<String>,
    },

    /// Run a command on the sprite
    Exec {
        /// Command and arguments
        #[arg(trailing_var_arg = true)]
        cmd: Vec<String>,
    },

    /// Git clone a repo on a sprite
    Clone {
        /// Git URL to clone
        url: String,
        /// Sprite name
        sprite: Option<String>,
    },

    /// Interactive sprite picker
    Pick,

    /// Proxy remote ports to localhost
    Proxy {
        /// Ports to proxy (default: 8888 7681 8080)
        ports: Option<String>,
    },

    /// Print access URLs
    Url {
        /// Sprite name
        sprite: Option<String>,
    },

    /// Share a URL to access the sprite terminal from any device
    Share {
        /// Sprite name
        sprite: Option<String>,
    },

    /// Open the dashboard in your browser
    Web {
        /// Port for the dashboard (default: 8888)
        port: Option<u16>,
    },
}

#[derive(Subcommand)]
pub enum ContextAction {
    /// Push Claude sessions & settings to sprite
    Push {
        /// Sprite name
        sprite: Option<String>,
    },
    /// Pull Claude sessions & settings from sprite
    Pull {
        /// Sprite name
        sprite: Option<String>,
    },
}
