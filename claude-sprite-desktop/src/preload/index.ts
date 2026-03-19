import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('spriteAPI', {
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
})
