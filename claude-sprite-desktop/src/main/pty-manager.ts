import * as pty from 'node-pty'
import type { IPty } from 'node-pty'

const sessions = new Map<string, IPty>()

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

  const ptyProcess = pty.spawn('sprite', ['console', '-s', spriteName, '-o', spriteOrg], {
    name: 'xterm-256color',
    cols,
    rows,
    cwd: process.env.HOME,
    env: process.env as Record<string, string>,
  })

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
