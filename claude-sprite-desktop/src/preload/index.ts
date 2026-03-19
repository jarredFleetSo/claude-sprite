import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('spriteAPI', {
  listSprites: () => ipcRenderer.invoke('sprite:list'),
  loadConfig: () => ipcRenderer.invoke('config:load'),
  saveConfig: (cfg: Record<string, unknown>) => ipcRenderer.invoke('config:save', cfg),
  lifecycle: (sprite: string, org: string, action: string) =>
    ipcRenderer.invoke('sprite:lifecycle', { sprite, org, action }),
  runSpriteLogin: () => ipcRenderer.invoke('sprite:login'),
  onLifecycleProgress: (cb: (msg: string) => void) => {
    const handler = (_: unknown, msg: string) => cb(msg)
    ipcRenderer.on('lifecycle:progress', handler)
    return () => ipcRenderer.removeListener('lifecycle:progress', handler)
  },

  // Dispatch
  dispatch: (sprite: string, prompt: string, noSync?: boolean) =>
    ipcRenderer.invoke('dispatch:launch', { sprite, prompt, noSync }),
  abortDispatch: (sprite: string) =>
    ipcRenderer.invoke('dispatch:abort', { sprite }),
  onDispatchLog: (sprite: string, cb: (line: string) => void) => {
    const handler = (_: unknown, line: string) => cb(line)
    ipcRenderer.on(`dispatch:log:${sprite}`, handler)
    return () => ipcRenderer.removeListener(`dispatch:log:${sprite}`, handler)
  },
  onDispatchDone: (sprite: string, cb: (result: { code: number | null; success: boolean }) => void) => {
    const handler = (_: unknown, result: { code: number | null; success: boolean }) => cb(result)
    ipcRenderer.on(`dispatch:done:${sprite}`, handler)
    return () => ipcRenderer.removeListener(`dispatch:done:${sprite}`, handler)
  },

  // Sync
  syncPush: (sprite: string) =>
    ipcRenderer.invoke('sync:push', { sprite }),
  syncPull: (sprite: string) =>
    ipcRenderer.invoke('sync:pull', { sprite }),
  onSyncProgress: (sprite: string, cb: (line: string) => void) => {
    const handler = (_: unknown, line: string) => cb(line)
    ipcRenderer.on(`sync:progress:${sprite}`, handler)
    return () => ipcRenderer.removeListener(`sync:progress:${sprite}`, handler)
  },
  onSyncDone: (sprite: string, cb: (result: { success: boolean }) => void) => {
    const handler = (_: unknown, result: { success: boolean }) => cb(result)
    ipcRenderer.on(`sync:done:${sprite}`, handler)
    return () => ipcRenderer.removeListener(`sync:done:${sprite}`, handler)
  },
})
