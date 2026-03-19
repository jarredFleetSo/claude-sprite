import { ipcMain, BrowserWindow, Notification } from 'electron'
import { ChildProcess } from 'child_process'
import { spawnCsCommand, spawnCsStreaming } from '../cli'
import { loadConfig } from '../config-store'

// Track active log polling intervals so abort can stop them
const activePollers = new Map<string, NodeJS.Timeout>()
// Track the cs dispatch child process during setup phase
const activeSetupProcs = new Map<string, ChildProcess>()

export function registerDispatchHandlers(win: BrowserWindow): void {

  ipcMain.handle('dispatch:launch', async (_e, { sprite, prompt, noSync }: {
    sprite: string; prompt: string; noSync?: boolean
  }) => {
    // Check auto-sync config if noSync not explicitly set
    if (noSync === undefined) {
      const config = await loadConfig()
      noSync = config?.autoSyncBeforeDispatch === false
    }

    // Kill any existing polling for this sprite
    const existingPoller = activePollers.get(sprite)
    if (existingPoller) clearInterval(existingPoller)

    // Build args: cs dispatch "prompt" <sprite> [--no-sync]
    const args = ['dispatch', prompt, sprite]
    if (noSync) args.push('--no-sync')

    // Phase 1: Run cs dispatch (fire-and-forget — exits after tmux launch)
    // Stream setup lines (waking, syncing, launching) to renderer
    const setupProc = spawnCsStreaming(args)
    activeSetupProcs.set(sprite, setupProc)

    setupProc.stdout?.on('data', (d: Buffer) => {
      win.webContents.send(`dispatch:log:${sprite}`, d.toString())
    })
    setupProc.stderr?.on('data', (d: Buffer) => {
      win.webContents.send(`dispatch:log:${sprite}`, d.toString())
    })

    return new Promise<{ started: boolean; error?: string }>((resolve) => {
      setupProc.on('close', (code) => {
        activeSetupProcs.delete(sprite)
        if (code !== 0) {
          win.webContents.send(`dispatch:done:${sprite}`, { code, success: false })
          resolve({ started: false, error: `cs dispatch exited with code ${code}` })
          return
        }

        // Phase 2: cs dispatch exited successfully — tmux window now running Claude
        // Start polling cs logs for live output
        let lastLineCount = 0
        const interval = setInterval(async () => {
          try {
            const result = await spawnCsCommand(['logs', sprite])
            const lines = result.stdout.split('\n').filter(l => l.length > 0)
            const newLines = lines.slice(lastLineCount)
            lastLineCount = lines.length

            for (const line of newLines) {
              win.webContents.send(`dispatch:log:${sprite}`, line + '\n')
              if (line.includes('DISPATCH_DONE')) {
                clearInterval(interval)
                activePollers.delete(sprite)
                win.webContents.send(`dispatch:done:${sprite}`, { code: 0, success: true })
                new Notification({
                  title: 'Dispatch complete',
                  body: `${sprite}: ${prompt.slice(0, 60)}${prompt.length > 60 ? '...' : ''}`,
                }).show()
                return
              }
            }
          } catch {
            // Polling error — sprite may have gone cold; continue trying
          }
        }, 1000)
        activePollers.set(sprite, interval)

        resolve({ started: true })
      })

      setupProc.on('error', (err) => {
        activeSetupProcs.delete(sprite)
        resolve({ started: false, error: err.message })
      })
    })
  })

  ipcMain.handle('dispatch:abort', async (_e, { sprite }: { sprite: string }) => {
    // Layer 1: Stop local polling
    const poller = activePollers.get(sprite)
    if (poller) {
      clearInterval(poller)
      activePollers.delete(sprite)
    }

    // Kill setup process if still running
    const setupProc = activeSetupProcs.get(sprite)
    if (setupProc) {
      setupProc.kill('SIGTERM')
      activeSetupProcs.delete(sprite)
    }

    // Layer 2: Kill remote tmux dispatch window
    const result = await spawnCsCommand(['abort', sprite])
    return { code: result.code }
  })
}
