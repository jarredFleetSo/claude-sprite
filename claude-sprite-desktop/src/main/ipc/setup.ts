import { ipcMain, BrowserWindow } from 'electron'
import { spawn } from 'child_process'
import { loadConfig, saveConfig } from '../config-store'

export function registerSetupHandlers(_win: BrowserWindow): void {
  ipcMain.handle('config:load', async () => {
    return loadConfig()
  })

  ipcMain.handle('config:save', async (_e, cfg: Record<string, unknown>) => {
    await saveConfig(cfg as any)
  })

  // Path A: Browser OAuth per user decision in CONTEXT.md
  // "Step 1 has a 'Run sprite login' button that opens browser, waits for token,
  //  auto-fills when OAuth completes"
  ipcMain.handle('sprite:login', async () => {
    return new Promise((resolve) => {
      const proc = spawn('sprite', ['login'], {
        env: process.env,
        stdio: 'inherit',   // Opens browser automatically
      })
      proc.on('close', async (code) => {
        if (code === 0) {
          // sprite login writes token to ~/.sprites/ keyring
          // Reload config to pick up the new token
          const config = await loadConfig()
          resolve({ success: true, config })
        } else {
          resolve({ success: false, error: `sprite login exited ${code}` })
        }
      })
      proc.on('error', (err) => {
        resolve({ success: false, error: err.message })
      })
    })
  })
}
