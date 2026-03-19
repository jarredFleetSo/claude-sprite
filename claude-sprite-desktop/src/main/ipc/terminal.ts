import { ipcMain, BrowserWindow } from 'electron'
import { openSession, writeToSession, resizeSession, killSession } from '../pty-manager'
import { loadConfig } from '../config-store'

export function registerTerminalHandlers(win: BrowserWindow): void {
  ipcMain.handle('terminal:open', async (_e, { sprite, org, cols, rows }: {
    sprite: string; org: string; cols: number; rows: number
  }) => {
    // Load project directory for this sprite
    const config = await loadConfig()
    const projectDir = config?.spriteProjects?.[sprite]
    console.log(`[terminal] Opening terminal for ${sprite} (org: ${org}, cols: ${cols}, rows: ${rows}, dir: ${projectDir || '~'})`)
    openSession(
      sprite,
      org,
      cols,
      rows,
      (data) => {
        win.webContents.send(`terminal:output:${sprite}`, data)
      },
      (code) => {
        console.log(`[terminal] exit for ${sprite}: code ${code}`)
        win.webContents.send(`terminal:exit:${sprite}`, { code })
      },
      projectDir
    )
    return { ok: true }
  })

  ipcMain.handle('terminal:close', async (_e, { sprite }: { sprite: string }) => {
    killSession(sprite)
    return { ok: true }
  })

  ipcMain.on('terminal:input', (_e, { sprite, data }: { sprite: string; data: string }) => {
    writeToSession(sprite, data)
  })

  ipcMain.on('terminal:resize', (_e, { sprite, cols, rows }: { sprite: string; cols: number; rows: number }) => {
    resizeSession(sprite, cols, rows)
  })
}
