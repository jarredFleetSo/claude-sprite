import { ipcMain, BrowserWindow } from 'electron'
import { runSpriteCommand } from '../cli'

export function registerSpriteHandlers(win: BrowserWindow): void {
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
