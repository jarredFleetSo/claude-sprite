import { describe, test } from 'vitest'

describe('config-store', () => {
  // SHELL-03: Config persistence
  test.todo('loadConfig returns stored config from electron-store')
  test.todo('loadConfig auto-imports from ~/.config/cs/config.toml when no stored config')
  test.todo('auto-imported config sets autoImported: true')
  test.todo('auto-imported config has empty anthropicApiKey')
  test.todo('saveConfig merges partial config with existing')
  test.todo('parseCsConfig extracts sprite_token and org from TOML format')
})
