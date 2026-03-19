import { spawn } from 'child_process'

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
    const proc = spawn('sprite', args, { env: process.env })
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
