import { ipcMain, BrowserWindow } from 'electron'
import { spawnCsStreaming } from '../cli'

export function registerSyncHandlers(win: BrowserWindow): void {

  ipcMain.handle('sync:push', async (_e, { sprite }: { sprite: string }) => {
    return new Promise<{ success: boolean; error?: string }>((resolve) => {
      // cs sync . <sprite> — sync current directory (Electron app cwd)
      const proc = spawnCsStreaming(['sync', '.', sprite])

      proc.stdout?.on('data', (d: Buffer) => {
        win.webContents.send(`sync:progress:${sprite}`, d.toString())
      })
      proc.stderr?.on('data', (d: Buffer) => {
        win.webContents.send(`sync:progress:${sprite}`, d.toString())
      })
      proc.on('close', (code) => {
        const success = code === 0
        win.webContents.send(`sync:done:${sprite}`, { success })
        resolve({ success })
      })
      proc.on('error', (err) => {
        resolve({ success: false, error: err.message })
      })
    })
  })

  ipcMain.handle('sync:pull', async (_e, { sprite }: { sprite: string }) => {
    return new Promise<{ success: boolean; error?: string }>((resolve) => {
      const proc = spawnCsStreaming(['context', 'pull', sprite])

      proc.stdout?.on('data', (d: Buffer) => {
        win.webContents.send(`sync:progress:${sprite}`, d.toString())
      })
      proc.stderr?.on('data', (d: Buffer) => {
        win.webContents.send(`sync:progress:${sprite}`, d.toString())
      })
      proc.on('close', (code) => {
        const success = code === 0
        win.webContents.send(`sync:done:${sprite}`, { success })
        resolve({ success })
      })
      proc.on('error', (err) => {
        resolve({ success: false, error: err.message })
      })
    })
  })
}
