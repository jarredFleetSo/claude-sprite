import { spawn, type ChildProcess } from 'child_process'
import * as path from 'path'
import * as os from 'os'

interface Session {
  proc: ChildProcess
  sprite: string
}

const sessions = new Map<string, Session>()

function getEnvWithPath(): Record<string, string> {
  const env = { ...process.env } as Record<string, string>
  const extra = [
    path.join(os.homedir(), '.local', 'bin'),
    '/usr/local/bin',
    '/opt/homebrew/bin',
  ]
  const cur = env.PATH || ''
  const missing = extra.filter((p) => !cur.includes(p))
  if (missing.length > 0) env.PATH = [...missing, cur].join(':')
  env.TERM = 'xterm-256color'
  return env
}

export function openSession(
  spriteName: string,
  spriteOrg: string,
  _cols: number,
  _rows: number,
  onData: (data: string) => void,
  onExit: (code: number) => void,
  projectDir?: string
): void {
  const existing = sessions.get(spriteName)
  if (existing) {
    try { existing.proc.kill() } catch { /* ignore */ }
    sessions.delete(spriteName)
  }

  const env = getEnvWithPath()
  const dirFlag = projectDir ? `--dir ${projectDir}` : ''
  console.log('[pty-manager] Spawning sprite exec --tty for', spriteName, dirFlag ? `in ${projectDir}` : '')

  const args = ['-o', spriteOrg, '-s', spriteName, 'exec', '--tty']
  if (projectDir) args.push('--dir', projectDir)
  args.push('--', '/bin/bash')

  const proc = spawn('sprite', args, {
    env,
    stdio: ['pipe', 'pipe', 'pipe'],
  })

  sessions.set(spriteName, { proc, sprite: spriteName })

  proc.stdout?.on('data', (chunk: Buffer) => {
    onData(chunk.toString())
  })

  proc.stderr?.on('data', (chunk: Buffer) => {
    onData(chunk.toString())
  })

  proc.on('close', (code) => {
    console.log('[pty-manager] Session closed for', spriteName, 'code:', code)
    sessions.delete(spriteName)
    onExit(code ?? -1)
  })

  proc.on('error', (err) => {
    console.error('[pty-manager] Spawn error for', spriteName, err.message)
    onData(`\r\nError: ${err.message}\r\n`)
    sessions.delete(spriteName)
    onExit(-1)
  })
}

export function writeToSession(spriteName: string, data: string): void {
  const session = sessions.get(spriteName)
  if (session?.proc.stdin?.writable) {
    session.proc.stdin.write(data)
  }
}

export function resizeSession(_spriteName: string, _cols: number, _rows: number): void {
  // child_process doesn't support resize — sprite exec handles terminal size via SSH
}

export function killSession(spriteName: string): void {
  const session = sessions.get(spriteName)
  if (session) {
    try { session.proc.kill() } catch { /* ignore */ }
    sessions.delete(spriteName)
  }
}

export function killAllSessions(): void {
  for (const [name, session] of sessions) {
    try { session.proc.kill() } catch { /* ignore */ }
    sessions.delete(name)
  }
}
