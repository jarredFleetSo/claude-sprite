import { describe, test, expect, vi, beforeEach } from 'vitest'
import { EventEmitter } from 'events'

// --- Mocks ---

vi.mock('child_process', () => ({
  spawn: vi.fn(),
  ChildProcess: class {},
}))

const handlers = new Map<string, (...args: unknown[]) => unknown>()
const mockWebContentsSend = vi.fn()
const mockBrowserWindow = {
  webContents: { send: mockWebContentsSend },
}

vi.mock('electron', () => ({
  ipcMain: {
    handle: (channel: string, handler: (...args: unknown[]) => unknown) => {
      handlers.set(channel, handler)
    },
  },
  BrowserWindow: vi.fn(),
}))

const mockSpawnCsStreaming = vi.fn()

vi.mock('../cli', () => ({
  spawnCsCommand: vi.fn(),
  spawnCsStreaming: (...args: unknown[]) => mockSpawnCsStreaming(...args),
}))

// Helper: create a fake ChildProcess
function makeFakeProc() {
  const proc = new EventEmitter() as EventEmitter & {
    stdout: EventEmitter
    stderr: EventEmitter
  }
  proc.stdout = new EventEmitter()
  proc.stderr = new EventEmitter()
  return proc
}

// --- Tests ---

describe('sync:push IPC handler', () => {
  beforeEach(async () => {
    handlers.clear()
    mockWebContentsSend.mockClear()
    mockSpawnCsStreaming.mockClear()
    vi.resetModules()
  })

  // SYNC-01: sync:push handler spawns cs with args ['sync', '.', spriteName]
  test('SYNC-01: sync:push spawns cs sync with correct positional args', async () => {
    const { registerSyncHandlers } = await import('./sync')
    registerSyncHandlers(mockBrowserWindow as never)

    const fakeProc = makeFakeProc()
    mockSpawnCsStreaming.mockReturnValue(fakeProc)

    const pushHandler = handlers.get('sync:push')!
    const pushPromise = pushHandler({}, { sprite: 'push-sprite' })

    expect(mockSpawnCsStreaming).toHaveBeenCalledWith(['sync', '.', 'push-sprite'])

    fakeProc.emit('close', 0)
    await pushPromise
  })

  // SYNC-01: sync:push sends sync:progress:{sprite} events from stdout/stderr
  test('SYNC-01: sync:push sends sync:progress events from stdout and stderr', async () => {
    const { registerSyncHandlers } = await import('./sync')
    registerSyncHandlers(mockBrowserWindow as never)

    const fakeProc = makeFakeProc()
    mockSpawnCsStreaming.mockReturnValue(fakeProc)

    const pushHandler = handlers.get('sync:push')!
    const pushPromise = pushHandler({}, { sprite: 'progress-sprite' })

    // Emit data from stdout and stderr
    fakeProc.stdout.emit('data', Buffer.from('Syncing files...\n'))
    fakeProc.stderr.emit('data', Buffer.from('5 files synced\n'))

    expect(mockWebContentsSend).toHaveBeenCalledWith('sync:progress:progress-sprite', 'Syncing files...\n')
    expect(mockWebContentsSend).toHaveBeenCalledWith('sync:progress:progress-sprite', '5 files synced\n')

    fakeProc.emit('close', 0)
    await pushPromise
  })

  // SYNC-01: sync:push sends sync:done:{sprite} with success=true on code 0
  test('SYNC-01: sync:push sends sync:done with success=true on exit code 0', async () => {
    const { registerSyncHandlers } = await import('./sync')
    registerSyncHandlers(mockBrowserWindow as never)

    const fakeProc = makeFakeProc()
    mockSpawnCsStreaming.mockReturnValue(fakeProc)

    const pushHandler = handlers.get('sync:push')!
    const pushPromise = pushHandler({}, { sprite: 'done-sprite' })

    fakeProc.emit('close', 0)
    const result = await pushPromise

    expect(mockWebContentsSend).toHaveBeenCalledWith('sync:done:done-sprite', { success: true })
    expect(result).toEqual({ success: true })
  })
})

describe('sync:pull IPC handler', () => {
  beforeEach(async () => {
    handlers.clear()
    mockWebContentsSend.mockClear()
    mockSpawnCsStreaming.mockClear()
    vi.resetModules()
  })

  // SYNC-02: sync:pull handler spawns cs with args ['context', 'pull', spriteName]
  test('SYNC-02: sync:pull spawns cs context pull with correct positional args', async () => {
    const { registerSyncHandlers } = await import('./sync')
    registerSyncHandlers(mockBrowserWindow as never)

    const fakeProc = makeFakeProc()
    mockSpawnCsStreaming.mockReturnValue(fakeProc)

    const pullHandler = handlers.get('sync:pull')!
    const pullPromise = pullHandler({}, { sprite: 'pull-sprite' })

    expect(mockSpawnCsStreaming).toHaveBeenCalledWith(['context', 'pull', 'pull-sprite'])

    fakeProc.emit('close', 0)
    await pullPromise
  })

  // SYNC-02: sync:pull sends sync:done:{sprite} with success=false on non-zero exit
  test('SYNC-02: sync:pull sends sync:done with success=false on non-zero exit', async () => {
    const { registerSyncHandlers } = await import('./sync')
    registerSyncHandlers(mockBrowserWindow as never)

    const fakeProc = makeFakeProc()
    mockSpawnCsStreaming.mockReturnValue(fakeProc)

    const pullHandler = handlers.get('sync:pull')!
    const pullPromise = pullHandler({}, { sprite: 'fail-sprite' })

    fakeProc.emit('close', 1)
    const result = await pullPromise

    expect(mockWebContentsSend).toHaveBeenCalledWith('sync:done:fail-sprite', { success: false })
    expect(result).toEqual({ success: false })
  })
})
