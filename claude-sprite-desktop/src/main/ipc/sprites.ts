import { ipcMain, BrowserWindow, net } from 'electron'
import { runSpriteCommand } from '../cli'
import { loadConfig } from '../config-store'

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
        args.push('exec', '-s', sprite, '-o', org, 'echo', 'waking')
        break
      case 'stop':
        args.push('stop', '-s', sprite, '-o', org)
        break
      case 'destroy':
        args.push('destroy', sprite, '--force', '-o', org)
        break
      case 'create':
        args.push('create', sprite, '--skip-console', '-o', org)
        break
      default:
        return { success: false, error: `Unknown action: ${action}` }
    }

    const result = await runSpriteCommand(args, sendProgress)
    return { success: result.code === 0, error: result.stderr || undefined }
  })
}
