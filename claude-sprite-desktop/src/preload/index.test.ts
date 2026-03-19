import { describe, test } from 'vitest'

describe('preload contextBridge API', () => {
  // SHELL-04: Secure IPC
  test.todo('exposes spriteAPI via contextBridge.exposeInMainWorld')
  test.todo('spriteAPI has loadConfig function')
  test.todo('spriteAPI has saveConfig function')
  test.todo('spriteAPI has lifecycle function')
  test.todo('spriteAPI has runSpriteLogin function')
  test.todo('spriteAPI has onLifecycleProgress function')
  test.todo('does NOT expose raw ipcRenderer')
})
