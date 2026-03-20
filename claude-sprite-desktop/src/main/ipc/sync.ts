import { ipcMain, BrowserWindow } from 'electron'
import { spawnCsStreaming, runSpriteCommand } from '../cli'
import { loadConfig } from '../config-store'
import { execSync } from 'child_process'
import * as path from 'path'

// Get git remote URL from a local project directory
function getGitRemote(projectDir: string): string | null {
  try {
    const url = execSync('git remote get-url origin', { cwd: projectDir, encoding: 'utf-8' }).trim()
    return url || null
  } catch {
    return null
  }
}

// Get current git branch
function getGitBranch(projectDir: string): string | null {
  try {
    return execSync('git rev-parse --abbrev-ref HEAD', { cwd: projectDir, encoding: 'utf-8' }).trim() || null
  } catch {
    return null
  }
}

export function registerSyncHandlers(win: BrowserWindow): void {

  ipcMain.handle('sync:push', async (_e, { sprite }: { sprite: string }) => {
    const config = await loadConfig()
    const projectDir = config?.spriteProjects?.[sprite] || '.'
    const org = config?.org || ''
    console.log(`[sync] Push for ${sprite} from ${projectDir}`)

    // Check if it's a git repo — if so, clone on sprite instead of tar sync
    const gitRemote = getGitRemote(projectDir)
    const gitBranch = getGitBranch(projectDir)
    const basename = path.basename(projectDir)

    if (gitRemote) {
      console.log(`[sync] Git repo detected: ${gitRemote} branch: ${gitBranch}`)
      // Clone or pull on the sprite
      const cloneScript = `
cd ~
if [ -d "${basename}/.git" ]; then
  cd "${basename}" && git fetch origin && git checkout ${gitBranch || 'main'} && git pull origin ${gitBranch || 'main'} 2>&1
  echo "SYNC_DONE: pulled latest"
else
  git clone ${gitRemote} "${basename}" 2>&1
  ${gitBranch ? `cd "${basename}" && git checkout ${gitBranch} 2>&1` : ''}
  echo "SYNC_DONE: cloned"
fi
`
      return new Promise<{ success: boolean; error?: string }>((resolve) => {
        runSpriteCommand(
          ['-o', org, '-s', sprite, 'exec', '--', 'bash', '-c', cloneScript],
          (msg) => win.webContents.send(`sync:progress:${sprite}`, msg)
        ).then((result) => {
          const success = result.code === 0
          win.webContents.send(`sync:done:${sprite}`, { success })
          resolve({ success, error: success ? undefined : result.stderr })
        })
      })
    }

    // Fallback: tar sync for non-git directories
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
