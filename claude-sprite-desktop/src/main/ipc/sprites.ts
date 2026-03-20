import { ipcMain, BrowserWindow, net } from 'electron'
import { runSpriteCommand, spawnCsCommand } from '../cli'
import { loadConfig } from '../config-store'
import * as fs from 'fs'
import * as path from 'path'

// Provision a sprite with API key, tools, project sync
async function provisionSprite(
  sprite: string,
  org: string,
  sendProgress: (msg: string) => void
): Promise<void> {
  console.log(`[provision] Starting provision for ${sprite} (org: ${org})`)
  const config = await loadConfig()

  // 1. Push API key
  if (config?.anthropicApiKey) {
    try {
      sendProgress('Pushing API key...')
      const keyB64 = Buffer.from(config.anthropicApiKey).toString('base64')
      const script = `KEY=$(echo '${keyB64}' | base64 -d) && echo "export ANTHROPIC_API_KEY=\\"$KEY\\"" > ~/.claude_env && chmod 600 ~/.claude_env && grep -qF '.claude_env' ~/.bashrc 2>/dev/null || echo '[ -f ~/.claude_env ] && . ~/.claude_env' >> ~/.bashrc && grep -qF '.claude_env' ~/.profile 2>/dev/null || echo '[ -f ~/.claude_env ] && . ~/.claude_env' >> ~/.profile && echo "API key configured"`
      await runSpriteCommand(['-o', org, '-s', sprite, 'exec', '--', 'bash', '-c', script], sendProgress)
      console.log(`[provision] API key pushed for ${sprite}`)
    } catch (err) {
      console.error(`[provision] API key push failed for ${sprite}:`, err)
    }
  }

  // 2. Claude onboarding
  try {
    sendProgress('Setting up Claude...')
    const onboardScript = `config="$HOME/.claude.json"; [ ! -f "$config" ] && echo '{"hasCompletedOnboarding":true,"lastOnboardingVersion":"99.0.0"}' > "$config" && exit 0; command -v jq >/dev/null 2>&1 && { tmp=$(mktemp); jq '.hasCompletedOnboarding=true | .lastOnboardingVersion="99.0.0" | if .projects then .projects |= with_entries(.value.hasTrustDialogAccepted=true) else . end' "$config" > "$tmp" 2>/dev/null && mv "$tmp" "$config"; } || true; echo "Claude ready"`
    await runSpriteCommand(['-o', org, '-s', sprite, 'exec', '--', 'bash', '-c', onboardScript], sendProgress)
    console.log(`[provision] Claude onboarding done for ${sprite}`)
  } catch (err) {
    console.error(`[provision] Claude onboarding failed for ${sprite}:`, err)
  }

  // 3. SSH keys (15s timeout)
  try {
    sendProgress('Syncing SSH keys...')
    await Promise.race([
      spawnCsCommand(['ssh-keys', sprite], sendProgress).catch(() => {}),
      new Promise<void>((r) => setTimeout(r, 15000)),
    ])
    console.log(`[provision] SSH keys done for ${sprite}`)
  } catch (err) {
    console.error(`[provision] SSH keys failed for ${sprite}:`, err)
  }

  // 4. Git config
  try {
    sendProgress('Setting up git...')
    const { execSync } = require('child_process')
    const gitName = (() => { try { return execSync('git config --global user.name', { encoding: 'utf-8' }).trim() } catch { return '' } })()
    const gitEmail = (() => { try { return execSync('git config --global user.email', { encoding: 'utf-8' }).trim() } catch { return '' } })()
    if (gitName || gitEmail) {
      const parts = [gitName ? `git config --global user.name "${gitName}"` : '', gitEmail ? `git config --global user.email "${gitEmail}"` : ''].filter(Boolean).join(' && ')
      await runSpriteCommand(['-o', org, '-s', sprite, 'exec', '--', 'bash', '-c', parts], sendProgress)
    }
    console.log(`[provision] Git config done for ${sprite}`)
  } catch (err) {
    console.error(`[provision] Git config failed for ${sprite}:`, err)
  }

  // 5. Sync project (git clone/pull or tar)
  const projectDir = config?.spriteProjects?.[sprite]
  if (projectDir) {
    try {
      sendProgress('Syncing project...')
      const { execSync } = require('child_process')
      const gitRemote = (() => { try { return execSync('git remote get-url origin', { cwd: projectDir, encoding: 'utf-8' }).trim() } catch { return null } })()
      const gitBranch = (() => { try { return execSync('git rev-parse --abbrev-ref HEAD', { cwd: projectDir, encoding: 'utf-8' }).trim() } catch { return null } })()
      const basename = path.basename(projectDir)

      if (gitRemote) {
        console.log(`[provision] Git clone/pull ${gitRemote} branch=${gitBranch} for ${sprite}`)
        const cloneScript = `cd ~ && if [ -d "${basename}/.git" ]; then cd "${basename}" && git fetch origin && git checkout ${gitBranch || 'main'} && git pull origin ${gitBranch || 'main'} 2>&1 && echo "SYNC: pulled"; else git clone ${gitRemote} "${basename}" 2>&1 && ${gitBranch ? `cd "${basename}" && git checkout ${gitBranch} 2>&1 &&` : ''} echo "SYNC: cloned"; fi`
        await runSpriteCommand(['-o', org, '-s', sprite, 'exec', '--', 'bash', '-c', cloneScript], sendProgress, 120000)
      } else {
        console.log(`[provision] Tar sync ${projectDir} for ${sprite}`)
        await spawnCsCommand(['sync', projectDir, sprite], sendProgress)
      }
      console.log(`[provision] Project synced for ${sprite}`)
    } catch (err) {
      console.error(`[provision] Project sync failed for ${sprite}:`, err)
    }
  } else {
    console.log(`[provision] No project dir set for ${sprite}, skipping sync`)
  }

  // 6. Auto-detect and install dev tools
  if (projectDir) {
    try {
      const tools: string[] = []
      if (fs.existsSync(path.join(projectDir, 'pyproject.toml')) || fs.existsSync(path.join(projectDir, 'requirements.txt'))) tools.push('python')
      if (fs.existsSync(path.join(projectDir, 'package.json'))) tools.push('node')
      if (fs.existsSync(path.join(projectDir, 'Cargo.toml'))) tools.push('rust')
      if (fs.existsSync(path.join(projectDir, 'go.mod'))) tools.push('go')

      if (tools.length > 0) {
        sendProgress(`Installing: ${tools.join(', ')}...`)
        console.log(`[provision] Installing tools: ${tools.join(', ')} for ${sprite}`)
        const installParts = tools.map((t) => {
          switch (t) {
            case 'python': return `command -v uv >/dev/null 2>&1 || { echo "Installing uv..."; curl -LsSf https://astral.sh/uv/install.sh | sh; export PATH="$HOME/.local/bin:$PATH"; }; echo "uv: $(uv --version 2>/dev/null || echo installed)"`
            case 'node': return `command -v node >/dev/null 2>&1 || { echo "Installing Node..."; curl -fsSL https://fnm.vercel.app/install | bash; export PATH="$HOME/.local/share/fnm:$PATH"; eval "$(fnm env)" 2>/dev/null; fnm install --lts; }; echo "node: $(node --version 2>/dev/null || echo installed)"`
            case 'rust': return `command -v cargo >/dev/null 2>&1 || { echo "Installing Rust..."; curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y; export PATH="$HOME/.cargo/bin:$PATH"; }; echo "rust: $(rustc --version 2>/dev/null || echo installed)"`
            case 'go': return `command -v go >/dev/null 2>&1 || { echo "Installing Go..."; curl -fsSL https://go.dev/dl/go1.22.0.linux-amd64.tar.gz | sudo tar -C /usr/local -xzf -; export PATH="/usr/local/go/bin:$PATH"; }; echo "go: $(go version 2>/dev/null || echo installed)"`
            default: return ''
          }
        }).filter(Boolean).join('; ')
        await runSpriteCommand(['-o', org, '-s', sprite, 'exec', '--', 'bash', '-c', installParts], sendProgress, 120000)
        console.log(`[provision] Tools installed for ${sprite}`)
      }
    } catch (err) {
      console.error(`[provision] Tool install failed for ${sprite}:`, err)
    }

    // 7. Custom bootstrap script
    const bootstrapPath = path.join(projectDir, '.sprite-bootstrap.sh')
    if (fs.existsSync(bootstrapPath)) {
      try {
        sendProgress('Running custom bootstrap...')
        const b64 = Buffer.from(fs.readFileSync(bootstrapPath, 'utf-8')).toString('base64')
        await runSpriteCommand(['-o', org, '-s', sprite, 'exec', '--', 'bash', '-c', `echo '${b64}' | base64 -d | bash`], sendProgress, 120000)
        console.log(`[provision] Custom bootstrap done for ${sprite}`)
      } catch (err) {
        console.error(`[provision] Custom bootstrap failed for ${sprite}:`, err)
      }
    }
  }

  sendProgress('Sprite ready')
  console.log(`[provision] Complete for ${sprite}`)
}

export function registerSpriteHandlers(win: BrowserWindow): void {
  ipcMain.handle('sprite:list', async () => {
    const config = await loadConfig()
    if (!config?.spriteToken) return []
    const resp = await net.fetch('https://api.sprites.dev/v1/sprites', {
      headers: { Authorization: `Bearer ${config.spriteToken}` },
    })
    if (!resp.ok) throw new Error(`Sprite API ${resp.status}`)
    const data = await resp.json()
    return Array.isArray(data) ? data : (data.sprites ?? [])
  })

  ipcMain.handle('sprite:lifecycle', async (_e, { sprite, org, action }: { sprite: string; org: string; action: string }) => {
    const sendProgress = (msg: string) =>
      win.webContents.send('lifecycle:progress', msg)

    const args: string[] = []
    switch (action) {
      case 'start':
        args.push('-o', org, '-s', sprite, 'exec', '--', 'echo', 'waking')
        break
      case 'stop':
        args.push('-o', org, '-s', sprite, 'checkpoint', 'create')
        break
      case 'destroy':
        args.push('-o', org, 'destroy', '--force', sprite)
        break
      case 'create':
        args.push('-o', org, 'create', '--skip-console', sprite)
        break
      default:
        return { success: false, error: `Unknown action: ${action}` }
    }

    const result = await runSpriteCommand(args, sendProgress)

    // After start or create, provision in background (don't block UI)
    if (result.code === 0 && (action === 'start' || action === 'create')) {
      console.log(`[lifecycle] ${action} succeeded for ${sprite}, starting background provision`)
      provisionSprite(sprite, org, sendProgress).catch((err) => {
        console.error(`[lifecycle] Provision failed for ${sprite}:`, err)
        sendProgress(`Provisioning warning: ${err}`)
      })
    }

    return { success: result.code === 0, error: result.stderr || undefined }
  })
}
