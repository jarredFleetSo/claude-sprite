import { spawn, ChildProcess } from 'child_process'
import * as path from 'path'
import * as os from 'os'

function getEnv(): NodeJS.ProcessEnv {
  const env = { ...process.env }
  // Ensure common bin dirs are in PATH (macOS strips PATH for GUI apps)
  const extra = [
    path.join(os.homedir(), '.local', 'bin'),
    '/usr/local/bin',
    '/opt/homebrew/bin',
  ]
  const cur = env.PATH || ''
  const missing = extra.filter((p) => !cur.includes(p))
  if (missing.length > 0) env.PATH = [...missing, cur].join(':')
  return env
}

export interface SpawnResult {
  code: number | null
  stdout: string
  stderr: string
}

export function runSpriteCommand(
  args: string[],
  onProgress?: (msg: string) => void
): Promise<SpawnResult> {
  return new Promise((resolve) => {
    console.log('[cli] sprite', args.join(' '))
    const proc = spawn('sprite', args, { env: getEnv() })
    let stdout = ''
    let stderr = ''

    proc.stdout.on('data', (data: Buffer) => {
      const chunk = data.toString()
      stdout += chunk
      onProgress?.(chunk)
    })
    proc.stderr.on('data', (data: Buffer) => {
      const chunk = data.toString()
      stderr += chunk
      onProgress?.(chunk)
    })
    proc.on('close', (code) => {
      resolve({ code, stdout, stderr })
    })
    proc.on('error', (err) => {
      resolve({ code: -1, stdout, stderr: err.message })
    })
  })
}

export function spawnCsCommand(
  args: string[],
  onProgress?: (msg: string) => void
): Promise<SpawnResult> {
  return new Promise((resolve) => {
    console.log('[cli] cs', args.join(' '))
    const proc = spawn('cs', args, { env: getEnv() })
    let stdout = ''
    let stderr = ''
    proc.stdout.on('data', (data: Buffer) => {
      const chunk = data.toString()
      stdout += chunk
      onProgress?.(chunk)
    })
    proc.stderr.on('data', (data: Buffer) => {
      const chunk = data.toString()
      stderr += chunk
      onProgress?.(chunk)
    })
    proc.on('close', (code) => resolve({ code, stdout, stderr }))
    proc.on('error', (err) => resolve({ code: -1, stdout, stderr: err.message }))
  })
}

export function spawnCsStreaming(args: string[]): ChildProcess {
  console.log('[cli] cs (streaming)', args.join(' '))
  return spawn('cs', args, { env: getEnv() })
}
