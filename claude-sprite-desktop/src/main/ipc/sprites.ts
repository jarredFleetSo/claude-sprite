import { ipcMain, BrowserWindow, net } from 'electron'
import { runSpriteCommand, spawnCsCommand } from '../cli'
import { loadConfig } from '../config-store'
import * as fs from 'fs'
import * as path from 'path'

// Push API key + SSH keys to a sprite (like cs ready does)
async function provisionSprite(
  sprite: string,
  org: string,
  sendProgress: (msg: string) => void
): Promise<void> {
  const config = await loadConfig()

  // Push Anthropic API key if we have one
  if (config?.anthropicApiKey) {
    sendProgress('Pushing API key...')
    // Base64 encode the key to avoid shell escaping issues
    const keyB64 = Buffer.from(config.anthropicApiKey).toString('base64')
    const script = `KEY=$(echo '${keyB64}' | base64 -d) && echo "export ANTHROPIC_API_KEY=\\"$KEY\\"" > ~/.claude_env && chmod 600 ~/.claude_env && grep -qF '.claude_env' ~/.bashrc 2>/dev/null || echo '[ -f ~/.claude_env ] && . ~/.claude_env' >> ~/.bashrc && grep -qF '.claude_env' ~/.profile 2>/dev/null || echo '[ -f ~/.claude_env ] && . ~/.claude_env' >> ~/.profile && echo "API key configured"`
    await runSpriteCommand(['-o', org, '-s', sprite, 'exec', '--', 'bash', '-c', script], sendProgress)
  }

  // Bypass Claude onboarding
  sendProgress('Setting up Claude...')
  const onboardScript = `
config="$HOME/.claude.json"
if [ ! -f "$config" ]; then
  echo '{"hasCompletedOnboarding":true,"lastOnboardingVersion":"99.0.0"}' > "$config"
else
  if command -v jq >/dev/null 2>&1; then
    tmp=$(mktemp)
    jq '.hasCompletedOnboarding=true | .lastOnboardingVersion="99.0.0" | if .projects then .projects |= with_entries(.value.hasTrustDialogAccepted=true) else . end' "$config" > "$tmp" 2>/dev/null && mv "$tmp" "$config"
  elif command -v node >/dev/null 2>&1; then
    node -e "const fs=require('fs');const p=process.env.HOME+'/.claude.json';let d={};try{d=JSON.parse(fs.readFileSync(p,'utf8'))}catch(e){}d.hasCompletedOnboarding=true;d.lastOnboardingVersion='99.0.0';if(d.projects){for(const k of Object.keys(d.projects)){d.projects[k].hasTrustDialogAccepted=true}}fs.writeFileSync(p,JSON.stringify(d,null,2));"
  fi
fi
echo "Claude ready"
`
  await runSpriteCommand(['-o', org, '-s', sprite, 'exec', '--', 'bash', '-c', onboardScript], sendProgress)

  // Push SSH keys (with 15s timeout — don't hang if sprite is slow)
  sendProgress('Syncing SSH keys...')
  const sshTimeout = new Promise<void>((resolve) => setTimeout(resolve, 15000))
  await Promise.race([
    spawnCsCommand(['ssh-keys', sprite], sendProgress).catch(() => {}),
    sshTimeout,
  ])

  // Copy local git config (name + email) to sprite
  sendProgress('Setting up git...')
  try {
    const { execSync } = require('child_process')
    const gitName = execSync('git config --global user.name', { encoding: 'utf-8' }).trim()
    const gitEmail = execSync('git config --global user.email', { encoding: 'utf-8' }).trim()
    if (gitName || gitEmail) {
      const gitScript = [
        gitName ? `git config --global user.name "${gitName}"` : '',
        gitEmail ? `git config --global user.email "${gitEmail}"` : '',
      ].filter(Boolean).join(' && ')
      await runSpriteCommand(['-o', org, '-s', sprite, 'exec', '--', 'bash', '-c', gitScript], sendProgress)
    }
  } catch { /* non-fatal */ }

  // Sync project to sprite via git clone (if git repo) before installing tools
  const projectDir = config?.spriteProjects?.[sprite]
  if (projectDir) {
    sendProgress('Syncing project...')
    try {
      const { execSync } = require('child_process')
      const gitRemote = (() => { try { return execSync('git remote get-url origin', { cwd: projectDir, encoding: 'utf-8' }).trim() } catch { return null } })()
      const gitBranch = (() => { try { return execSync('git rev-parse --abbrev-ref HEAD', { cwd: projectDir, encoding: 'utf-8' }).trim() } catch { return null } })()
      const basename = path.basename(projectDir)

      if (gitRemote) {
        const cloneScript = `cd ~ && if [ -d "${basename}/.git" ]; then cd "${basename}" && git fetch origin && git checkout ${gitBranch || 'main'} && git pull origin ${gitBranch || 'main'} 2>&1 && echo "SYNC: pulled"; else git clone ${gitRemote} "${basename}" 2>&1 && ${gitBranch ? `cd "${basename}" && git checkout ${gitBranch} 2>&1 &&` : ''} echo "SYNC: cloned"; fi`
        await runSpriteCommand(['-o', org, '-s', sprite, 'exec', '--', 'bash', '-c', cloneScript], sendProgress, 120000).catch(() => {})
      } else {
        // Fallback: tar sync
        await spawnCsCommand(['sync', projectDir, sprite], sendProgress).catch(() => {})
      }
    } catch { /* non-fatal */ }
  }

  // Auto-detect dev tools from project directory and install on sprite
  if (projectDir) {
    sendProgress('Installing dev tools...')
    const tools: string[] = []

    // Detect what the project needs
    if (fs.existsSync(path.join(projectDir, 'pyproject.toml')) || fs.existsSync(path.join(projectDir, 'requirements.txt'))) {
      tools.push('python')
    }
    if (fs.existsSync(path.join(projectDir, 'package.json'))) {
      tools.push('node')
    }
    if (fs.existsSync(path.join(projectDir, 'Cargo.toml'))) {
      tools.push('rust')
    }
    if (fs.existsSync(path.join(projectDir, 'go.mod'))) {
      tools.push('go')
    }

    if (tools.length > 0) {
      const installScript = tools.map((tool) => {
        switch (tool) {
          case 'python':
            return `
# Python: install uv if missing
if ! command -v uv >/dev/null 2>&1; then
  echo "Installing uv..."
  curl -LsSf https://astral.sh/uv/install.sh | sh 2>&1
  export PATH="$HOME/.local/bin:$PATH"
fi
echo "Python/uv: $(uv --version 2>/dev/null || echo 'installed')"
`
          case 'node':
            return `
# Node: install via nvm if missing
if ! command -v node >/dev/null 2>&1; then
  echo "Installing Node.js..."
  curl -fsSL https://fnm.vercel.app/install | bash 2>&1
  export PATH="$HOME/.local/share/fnm:$PATH"
  eval "$(fnm env)" 2>/dev/null
  fnm install --lts 2>&1
fi
echo "Node: $(node --version 2>/dev/null || echo 'installed')"
`
          case 'rust':
            return `
# Rust: install rustup if missing
if ! command -v cargo >/dev/null 2>&1; then
  echo "Installing Rust..."
  curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y 2>&1
  export PATH="$HOME/.cargo/bin:$PATH"
fi
echo "Rust: $(rustc --version 2>/dev/null || echo 'installed')"
`
          case 'go':
            return `
# Go: install if missing
if ! command -v go >/dev/null 2>&1; then
  echo "Installing Go..."
  curl -fsSL https://go.dev/dl/go1.22.0.linux-amd64.tar.gz | sudo tar -C /usr/local -xzf - 2>&1
  export PATH="/usr/local/go/bin:$PATH"
fi
echo "Go: $(go version 2>/dev/null || echo 'installed')"
`
          default:
            return ''
        }
      }).join('\n')

      sendProgress(`Installing: ${tools.join(', ')}...`)
      await runSpriteCommand(
        ['-o', org, '-s', sprite, 'exec', '--', 'bash', '-c', installScript],
        sendProgress,
        120000 // 2 min timeout for installs
      ).catch(() => {})
    }

    // Run custom bootstrap script if it exists in project dir
    const bootstrapPath = path.join(projectDir, '.sprite-bootstrap.sh')
    if (fs.existsSync(bootstrapPath)) {
      sendProgress('Running custom bootstrap...')
      const bootstrapScript = fs.readFileSync(bootstrapPath, 'utf-8')
      const b64 = Buffer.from(bootstrapScript).toString('base64')
      await runSpriteCommand(
        ['-o', org, '-s', sprite, 'exec', '--', 'bash', '-c', `echo '${b64}' | base64 -d | bash`],
        sendProgress,
        120000
      ).catch(() => {})
    }
  }

  sendProgress('Sprite ready')
}

export function registerSpriteHandlers(win: BrowserWindow): void {
  // List sprites via main process (avoids CORS)
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
        // No 'sprite start' command -- wake via first exec
        args.push('-o', org, '-s', sprite, 'exec', '--', 'echo', 'waking')
        break
      case 'stop':
        // No 'sprite stop' — use checkpoint create to suspend
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

    // After start or create, provision in background (don't block the UI)
    if (result.code === 0 && (action === 'start' || action === 'create')) {
      provisionSprite(sprite, org, sendProgress).catch((err) => {
        sendProgress(`Provisioning warning: ${err}`)
      })
    }

    return { success: result.code === 0, error: result.stderr || undefined }
  })
}
