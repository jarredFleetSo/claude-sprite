import * as pty from 'node-pty'
import type { IPty } from 'node-pty'
import * as path from 'path'
import * as os from 'os'

const sessions = new Map<string, IPty>()

function getEnvWithPath(): Record<string, string> {
  const env = { ...process.env } as Record<string, string>
  // Ensure common bin dirs are in PATH (macOS strips PATH for GUI apps)
  const extraPaths = [
    path.join(os.homedir(), '.local', 'bin'),
    '/usr/local/bin',
    '/opt/homebrew/bin',
  ]
  const currentPath = env.PATH || ''
  const missing = extraPaths.filter((p) => !currentPath.includes(p))
  if (missing.length > 0) {
    env.PATH = [...missing, currentPath].join(':')
  }
  return env
}

export function openSession(
  spriteName: string,
  spriteOrg: string,
  cols: number,
  rows: number,
  onData: (data: string) => void,
  onExit: (code: number) => void
): void {
  // Kill existing session for this sprite if any
  const existing = sessions.get(spriteName)
  if (existing) {
    try {
      existing.kill()
    } catch {
      // Ignore errors killing stale session
    }
    sessions.delete(spriteName)
  }

  const env = getEnvWithPath()
  console.log('[pty-manager] Opening session for', spriteName, 'org:', spriteOrg)
  console.log('[pty-manager] PATH includes ~/.local/bin:', env.PATH?.includes('.local/bin'))

  let ptyProcess: IPty
  try {
    ptyProcess = pty.spawn('sprite', ['-o', spriteOrg, '-s', spriteName, 'console'], {
      name: 'xterm-256color',
      cols,
      rows,
      cwd: env.HOME || os.homedir(),
      env,
    })
  } catch (err) {
    console.error('[pty-manager] Failed to spawn sprite console:', err)
    onData(`\r\nError: Failed to start terminal - ${err}\r\n`)
    onExit(-1)
    return
  }

  ptyProcess.onData((data) => onData(data))
  ptyProcess.onExit(({ exitCode }) => {
    sessions.delete(spriteName)
    onExit(exitCode)
  })

  sessions.set(spriteName, ptyProcess)
}

export function writeToSession(spriteName: string, data: string): void {
  const session = sessions.get(spriteName)
  if (session) {
    session.write(data)
  }
}

export function resizeSession(spriteName: string, cols: number, rows: number): void {
  const session = sessions.get(spriteName)
  if (session) {
    session.resize(cols, rows)
  }
}

export function killSession(spriteName: string): void {
  const session = sessions.get(spriteName)
  if (session) {
    try {
      session.kill()
    } catch {
      // Ignore errors killing session
    }
    sessions.delete(spriteName)
  }
}

export function killAllSessions(): void {
  for (const [name, session] of sessions) {
    try {
      session.kill()
    } catch {
      // Ignore errors killing session
    }
    sessions.delete(name)
  }
}
