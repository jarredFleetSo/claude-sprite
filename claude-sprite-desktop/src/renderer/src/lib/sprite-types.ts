// Verified live API response shape (2026-03-19)
export interface SpriteInfo {
  id: string
  name: string
  status: 'running' | 'warm' | 'cold' | 'suspended' | string
  url: string
  organization: string
  last_running_at: string | null
  last_warming_at: string | null
  updated_at: string
  created_at: string
}

export interface SpritesListResponse {
  name: string
  sprites: SpriteInfo[]
  running: number
  warm: number
  cold: number
  has_more: boolean
  next_continuation_token: string | null
  running_limit: number
  warm_limit: number
}

export interface AppConfig {
  spriteToken: string
  org: string
  anthropicApiKey: string
  theme?: 'light' | 'dark' | 'system'
  autoSyncBeforeDispatch?: boolean
  // Per-sprite project directory mappings (spriteName → local path)
  spriteProjects?: Record<string, string>
}

// Status display mapping
export type StatusCategory = 'running' | 'cold' | 'stopped'

export function categorizeStatus(status: string): StatusCategory {
  if (['running', 'warm', 'active'].includes(status)) return 'running'
  if (['cold', 'sleeping', 'suspended'].includes(status)) return 'cold'
  return 'stopped'
}

export interface DispatchResult {
  started: boolean
  error?: string
}

export interface AbortResult {
  code: number | null
}

export interface SyncResult {
  success: boolean
  error?: string
}

export interface TerminalTabInfo {
  sprite: SpriteInfo
  status: 'connecting' | 'connected' | 'disconnected'
}

// IPC API shape exposed via contextBridge
export interface SpriteAPI {
  listSprites: () => Promise<SpriteInfo[]>
  loadConfig: () => Promise<(AppConfig & { autoImported?: boolean }) | null>
  saveConfig: (cfg: Partial<AppConfig>) => Promise<void>
  lifecycle: (sprite: string, org: string, action: 'start' | 'stop' | 'destroy' | 'create') => Promise<{ success: boolean; error?: string }>
  runSpriteLogin: () => Promise<{ success: boolean; error?: string }>
  onLifecycleProgress: (cb: (msg: string) => void) => () => void

  // Folder picker
  pickFolder: () => Promise<string | null>

  // Dispatch
  dispatch: (sprite: string, prompt: string, noSync?: boolean) => Promise<DispatchResult>
  abortDispatch: (sprite: string) => Promise<AbortResult>
  onDispatchLog: (sprite: string, cb: (line: string) => void) => () => void
  onDispatchDone: (sprite: string, cb: (result: { code: number | null; success: boolean }) => void) => () => void

  // Sync
  syncPush: (sprite: string) => Promise<SyncResult>
  syncPull: (sprite: string) => Promise<SyncResult>
  onSyncProgress: (sprite: string, cb: (line: string) => void) => () => void
  onSyncDone: (sprite: string, cb: (result: { success: boolean }) => void) => () => void

  // Terminal
  terminalOpen: (sprite: string, org: string, cols: number, rows: number) => Promise<{ ok: boolean }>
  terminalClose: (sprite: string) => Promise<{ ok: boolean }>
  terminalInput: (sprite: string, data: string) => void
  terminalResize: (sprite: string, cols: number, rows: number) => void
  onTerminalOutput: (sprite: string, cb: (data: string) => void) => () => void
  onTerminalExit: (sprite: string, cb: (result: { code: number }) => void) => () => void
}
