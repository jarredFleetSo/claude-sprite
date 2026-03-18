# Claude Sprite

Run [Claude Code](https://docs.anthropic.com/en/docs/claude-code) on persistent cloud VMs ([Sprites](https://sprites.dev)). Start a task on your desktop, check progress on your phone, continue from a browser.

## Install

Requires [Rust](https://rustup.rs) and the [sprite CLI](https://sprites.dev).

```bash
cd cli && sudo bash install.sh
cs setup
```

## Workflows

### 1. Interactive development

Sync your project to a sprite and work with Claude remotely. API key, sessions, and context carry over automatically.

```
cs ready
```

That's it. `cs ready` resolves your sprite from `.cs.toml`, syncs files, pushes auth and context, and attaches you to the tmux session. Claude is ready — no onboarding, no login prompts. Run it again to re-sync and re-attach.

First time? `cs ready my-sprite` creates the mapping. After that, just `cs ready` from the project directory.

### 2. Fire-and-forget tasks

Dispatch a Claude prompt or any command to run on the sprite. Walk away — check back from anywhere.

```
cs dispatch "refactor the auth module to use JWT"
```

Monitor from any machine:

```
cs status        check progress
cs logs          tail output
cs attach        watch live
cs abort         kill it
```

Resume where Claude left off:

```
cs dispatch --resume
```

### 3. Run anything remotely

Not just Claude — builds, training, simulations, data pipelines. Same monitoring commands.

```
cs run "make train EPOCHS=100"
cs run "python simulate.py --seed 42 --days 90"
cs status
```

### 4. Mobile access

Get a terminal on your phone. `cs share` starts a web terminal on the sprite and prints the URL — authenticated via Sprites, no public exposure.

```
cs share
```

Open the URL on any device. The terminal connects to the same tmux session as `cs attach` — same running processes, same state.

### 5. Context sync

Push and pull Claude sessions, history, and settings between local and remote. Path remapping is automatic.

```
cs context push       sync sessions + history + CLAUDE.md to sprite
cs context pull       pull sessions + history back
```

After a push, you get a `claude --resume <id>` command to pick up where you left off.

## All commands

```
Daily workflow
  cs                      attach (picker if no mapping)
  cs ready [sprite]       create → auth → sync → context → attach
  cs share                web terminal URL for any device

File transfer
  cs sync [path]          push files to sprite (git-aware, progress bar)
  cs pull <remote> [local]  pull files from sprite

Remote execution
  cs dispatch "<prompt>"  fire-and-forget Claude task
  cs dispatch --resume    resume last session
  cs run "<cmd>"          run any command on sprite
  cs status               what's running?
  cs logs                 tail output
  cs attach               connect to terminal
  cs abort                kill running task

Sprite management
  cs list                 all sprites with status
  cs create / destroy     create or destroy
  cs start / stop         wake or checkpoint

Setup & config
  cs auth [sprite]        push API key
  cs ssh-keys [sprite]    sync SSH keys
  cs context push/pull    sync Claude sessions & settings
  cs shell-setup [sprite] install starship, fzf, etc.
  cs setup                config wizard
  cs proxy [ports]        forward remote ports
  cs url [sprite]         print access URLs
  cs web                  open dashboard
```

## Project auto-mapping

`cs ready my-sprite` from `~/git/my-project` stores the mapping in `.cs.toml`. After that, all commands auto-resolve — no sprite name needed.

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
