import { app, BrowserWindow } from 'electron'
import { join } from 'path'
import { is } from '@electron-toolkit/utils'
import { registerSpriteHandlers } from './ipc/sprites'
import { registerSetupHandlers } from './ipc/setup'
import { registerDispatchHandlers } from './ipc/dispatch'
import { registerSyncHandlers } from './ipc/sync'
import { registerTerminalHandlers } from './ipc/terminal'
import { killAllSessions } from './pty-manager'

const gotLock = app.requestSingleInstanceLock()
if (!gotLock) app.quit()

app.whenReady().then(async () => {
  // Fix PATH before any spawn calls (ESM-only package)
  const { default: fixPath } = await import('fix-path')
  fixPath()

  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })

  registerSpriteHandlers(win)
  registerSetupHandlers(win)
  registerDispatchHandlers(win)
  registerSyncHandlers(win)
  registerTerminalHandlers(win)

  if (is.dev && process.env.ELECTRON_RENDERER_URL) {
    win.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'))
  }
})

app.on('before-quit', () => {
  killAllSessions()
})

app.on('second-instance', () => {
  // Focus existing window
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
