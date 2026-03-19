const ANSI_RE = /\x1b\[[0-9;]*[mGKHF]|\r/g

export function stripAnsi(str: string): string {
  return str.replace(ANSI_RE, '')
}
