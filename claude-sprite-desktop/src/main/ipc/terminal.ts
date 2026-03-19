import { ipcMain, BrowserWindow } from 'electron'
import { openSession, writeToSession, resizeSession, killSession } from '../pty-manager'

export function registerTerminalHandlers(win: BrowserWindow): void {
  ipcMain.handle('terminal:open', async (_e, { sprite, org, cols, rows }: {
    sprite: string; org: string; cols: number; rows: number
  }) => {
    console.log(`[terminal] Opening terminal for ${sprite} (org: ${org}, cols: ${cols}, rows: ${rows})`)
    openSession(
      sprite,
      org,
      cols,
      rows,
      (data) => {
        console.log(`[terminal] output for ${sprite}: ${data.length} bytes`)
        win.webContents.send(`terminal:output:${sprite}`, data)
      },
      (code) => {
        console.log(`[terminal] exit for ${sprite}: code ${code}`)
        win.webContents.send(`terminal:exit:${sprite}`, { code })
      }
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
