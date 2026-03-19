import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'

interface AppConfig {
  spriteToken: string
  org: string
  anthropicApiKey: string
  theme?: 'light' | 'dark' | 'system'
  autoSyncBeforeDispatch?: boolean
}

let storeInstance: any = null

async function getStore() {
  if (storeInstance) return storeInstance
  const { default: Store } = await import('electron-store')
  storeInstance = new Store<{ config: AppConfig }>()
  return storeInstance
}

export async function loadConfig(): Promise<(AppConfig & { autoImported?: boolean }) | null> {
  const store = await getStore()
  const stored = store.get('config') as AppConfig | undefined

  if (stored?.spriteToken) return stored

  // Try auto-import from cs CLI config at ~/.config/cs/config.toml
  const csConfigPath = path.join(os.homedir(), '.config', 'cs', 'config.toml')
  try {
    const raw = fs.readFileSync(csConfigPath, 'utf-8')
    const parsed = parseCsConfig(raw)
    if (parsed.sprite_token) {
      // Extract org from token if not in config (token format: org/id/tokenid/value)
      let org = parsed.org || ''
      if (!org && parsed.sprite_token.includes('/')) {
        org = parsed.sprite_token.split('/')[0]
      }
      const imported: AppConfig = {
        spriteToken: parsed.sprite_token,
        org,
        anthropicApiKey: '',
      }
      store.set('config', imported)
      return { ...imported, autoImported: true }
    }
  } catch { /* no cs config */ }

  return null
}

export async function saveConfig(partial: Partial<AppConfig>): Promise<void> {
  const store = await getStore()
  const existing = (store.get('config') as AppConfig) ?? { spriteToken: '', org: '', anthropicApiKey: '' }
  store.set('config', { ...existing, ...partial })
}

// Minimal TOML key=value parser for cs config format
export function parseCsConfig(raw: string): Record<string, string> {
  const result: Record<string, string> = {}
  for (const line of raw.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith('[')) continue
    const eq = trimmed.indexOf('=')
    if (eq < 0) continue
    const key = trimmed.slice(0, eq).trim()
    const val = trimmed.slice(eq + 1).trim().replace(/^"|"$/g, '')
    result[key] = val
  }
  return result
}
