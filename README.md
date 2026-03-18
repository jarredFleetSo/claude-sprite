# Claude Sprite

Run [Claude Code](https://docs.anthropic.com/en/docs/claude-code) on persistent cloud VMs ([Sprites](https://sprites.dev)). Start a task on your desktop, check progress on your phone, continue from a browser.

## Install

Requires [Rust](https://rustup.rs) and the [sprite CLI](https://sprites.dev).

```bash
cd cli && sudo bash install.sh
cs setup
```

## Use cases

### Remote Claude (interactive)

Sync your local project to a sprite and work with Claude remotely. Your API key, sessions, and project context carry over automatically.

```bash
cd ~/git/my-project
cs ready                  # syncs files, pushes auth + context, attaches
# Claude is ready — no onboarding, no login prompts

cs ready                  # next time: re-syncs and re-attaches (remembers via .cs.toml)
```

### Long-running scripts

Fire off a Claude task or any command and walk away. Check back from your phone or another machine.

```bash
cs dispatch "refactor the auth module to use JWT tokens"
cs status                 # running, 23 min elapsed
cs logs                   # tail the output
cs attach                 # watch live
cs abort                  # kill it

cs dispatch --resume      # resume last Claude session headless
```

### Run anything remotely

Not just Claude — run builds, training jobs, data pipelines on a sprite with the same monitoring.

```bash
cs run "make train EPOCHS=100"
cs run "python simulate.py --seed 42 --days 90"
cs status                 # same status/logs/attach/abort commands work
```

### Mobile monitoring

Check on running tasks from your phone via the web dashboard.

```bash
cs web                    # open dashboard in browser
```

### Sprite management

```bash
cs list                   # all sprites with status
cs create <name>
cs start / stop <name>
cs destroy <name>
cs sync                   # push local → sprite
cs pull <remote> [local]  # pull files back
```

### All commands

```
cs                        attach (default, picker if no mapping)
cs ready [sprite]         create → auth → sync → context → attach
cs sync [path] [sprite]   push files to sprite (git-aware, progress bar)
cs pull <remote> [local]  pull files from sprite
cs dispatch "<prompt>"    fire-and-forget Claude task
cs dispatch --resume      resume last session headless
cs run "<cmd>"            run any command on sprite
cs status                 what's running?
cs logs                   tail output
cs attach                 connect to terminal
cs abort                  kill running task
cs list                   all sprites with status
cs create / destroy       create or destroy a sprite
cs start / stop           wake or checkpoint
cs auth [sprite]          push API key
cs ssh-keys [sprite]      sync SSH keys
cs context push/pull      sync Claude sessions & settings
cs shell-setup [sprite]   install starship, fzf, etc.
cs setup                  config wizard
cs proxy [ports]          forward remote ports
cs url [sprite]           print access URLs
cs web                    open dashboard
```

### Project auto-mapping

`cs ready axiom` from `~/git/axiom` stores the mapping in `.cs.toml`. After that, all commands auto-resolve — no sprite name needed.

## Dashboard

Mobile-friendly web UI with status monitoring, embedded terminal, sprite management, and token settings.

```bash
./claude-sprite           # start locally
```

## Project structure

```
cli/cs-rs/        Rust CLI (17 modules)
cli/install.sh    Build + install
app/              Web dashboard (Python stdlib, no deps)
scripts/          Sprite VM bootstrap
config/           Templates + tmux/shell config
docs/             Architecture, usage, setup guides
```

## License

MIT
