import { ipcMain, BrowserWindow, net } from 'electron'
import { runSpriteCommand, spawnCsCommand } from '../cli'
import { loadConfig } from '../config-store'

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
