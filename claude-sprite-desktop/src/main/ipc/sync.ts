import { ipcMain, BrowserWindow } from 'electron'
import { spawnCsStreaming } from '../cli'
import { loadConfig } from '../config-store'

export function registerSyncHandlers(win: BrowserWindow): void {

  ipcMain.handle('sync:push', async (_e, { sprite }: { sprite: string }) => {
    const config = await loadConfig()
    const projectDir = config?.spriteProjects?.[sprite] || '.'
    console.log(`[sync] Push for ${sprite} from ${projectDir}`)
    return new Promise<{ success: boolean; error?: string }>((resolve) => {
      const proc = spawnCsStreaming(['sync', projectDir, sprite])

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
    const config = await loadConfig()
    const projectDir = config?.spriteProjects?.[sprite]
    console.log(`[sync] Pull for ${sprite} to ${projectDir || 'cwd'}`)
    return new Promise<{ success: boolean; error?: string }>((resolve) => {
      // Pull context to the project directory if set
      const args = projectDir
        ? ['pull', `.`, '.', sprite]  // pull from sprite to local
        : ['context', 'pull', sprite]
      const proc = spawnCsStreaming(args)

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
