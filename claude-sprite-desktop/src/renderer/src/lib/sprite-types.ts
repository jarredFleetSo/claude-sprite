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
}

// Status display mapping
export type StatusCategory = 'running' | 'cold' | 'stopped'

export function categorizeStatus(status: string): StatusCategory {
  if (['running', 'warm', 'active'].includes(status)) return 'running'
  if (['cold', 'sleeping', 'suspended'].includes(status)) return 'cold'
  return 'stopped'
}

// IPC API shape exposed via contextBridge
// NOTE: No listSprites method -- sprite list is fetched directly from renderer
// via fetch('https://api.sprites.dev/v1/sprites') in useSprites hook.
export interface SpriteAPI {
  loadConfig: () => Promise<(AppConfig & { autoImported?: boolean }) | null>
  saveConfig: (cfg: Partial<AppConfig>) => Promise<void>
  lifecycle: (sprite: string, org: string, action: 'start' | 'stop' | 'destroy' | 'create') => Promise<{ success: boolean; error?: string }>
  runSpriteLogin: () => Promise<{ success: boolean; error?: string }>
  onLifecycleProgress: (cb: (msg: string) => void) => () => void
}
