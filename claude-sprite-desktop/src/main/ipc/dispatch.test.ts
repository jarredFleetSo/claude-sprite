import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest'
import { EventEmitter } from 'events'

// --- Mocks ---

// Mock child_process — return a fake ChildProcess with controllable streams
vi.mock('child_process', () => {
  return {
    spawn: vi.fn(),
    ChildProcess: class {},
  }
})

// Mock electron ipcMain.handle (capture handlers) and Notification
const handlers = new Map<string, (...args: unknown[]) => unknown>()
const mockWebContentsSend = vi.fn()
const mockBrowserWindow = {
  webContents: { send: mockWebContentsSend },
}

vi.mock('electron', () => {
  const MockNotification = vi.fn().mockImplementation(() => ({
    show: vi.fn(),
  }))
  return {
    ipcMain: {
      handle: (channel: string, handler: (...args: unknown[]) => unknown) => {
        handlers.set(channel, handler)
      },
    },
    BrowserWindow: vi.fn(),
    Notification: MockNotification,
  }
})

// Mock config-store
vi.mock('../config-store', () => ({
  loadConfig: vi.fn().mockResolvedValue({
    spriteToken: 'tok',
    org: 'testorg',
    anthropicApiKey: 'key',
    autoSyncBeforeDispatch: true,
  }),
}))

// Mock cli.ts functions
const mockSpawnCsCommand = vi.fn()
const mockSpawnCsStreaming = vi.fn()

vi.mock('../cli', () => ({
  spawnCsCommand: (...args: unknown[]) => mockSpawnCsCommand(...args),
  spawnCsStreaming: (...args: unknown[]) => mockSpawnCsStreaming(...args),
}))

// Helper: create a fake ChildProcess
function makeFakeProc() {
  const proc = new EventEmitter() as EventEmitter & {
    stdout: EventEmitter
    stderr: EventEmitter
    kill: ReturnType<typeof vi.fn>
  }
  proc.stdout = new EventEmitter()
  proc.stderr = new EventEmitter()
  proc.kill = vi.fn()
  return proc
}

// --- Tests ---

describe('dispatch:launch IPC handler', () => {
  beforeEach(async () => {
    handlers.clear()
    mockWebContentsSend.mockClear()
    mockSpawnCsCommand.mockClear()
    mockSpawnCsStreaming.mockClear()
    vi.clearAllMocks()
    // Re-import and register handlers fresh for each test
    vi.resetModules()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  // DISP-01: dispatch:launch handler spawns cs with args ['dispatch', prompt, spriteName]
  test('DISP-01: dispatch:launch spawns cs dispatch with positional args', async () => {
    const { registerDispatchHandlers } = await import('./dispatch')
    registerDispatchHandlers(mockBrowserWindow as never)

    const fakeProc = makeFakeProc()
    mockSpawnCsStreaming.mockReturnValue(fakeProc)

    const launchHandler = handlers.get('dispatch:launch')!
    const launchPromise = launchHandler({}, { sprite: 'my-sprite', prompt: 'do a thing', noSync: false })

    // cs dispatch should have been spawned
    expect(mockSpawnCsStreaming).toHaveBeenCalledWith(['dispatch', 'do a thing', 'my-sprite'])

    // Resolve the proc (exit code 0 = tmux launched successfully)
    // But we don't wait for the full resolution since polling starts — just test spawn args
    fakeProc.emit('error', new Error('test done'))
    await launchPromise
  })

  // DISP-01: dispatch:launch adds --no-sync flag when noSync=true
  test('DISP-01: dispatch:launch adds --no-sync when noSync=true', async () => {
    const { registerDispatchHandlers } = await import('./dispatch')
    registerDispatchHandlers(mockBrowserWindow as never)

    const fakeProc = makeFakeProc()
    mockSpawnCsStreaming.mockReturnValue(fakeProc)

    const launchHandler = handlers.get('dispatch:launch')!
    const launchPromise = launchHandler({}, { sprite: 'my-sprite', prompt: 'do a thing', noSync: true })

    expect(mockSpawnCsStreaming).toHaveBeenCalledWith(['dispatch', 'do a thing', 'my-sprite', '--no-sync'])

    fakeProc.emit('error', new Error('test done'))
    await launchPromise
  })

  // DISP-02: After cs dispatch exits (code 0), starts polling cs logs and sends dispatch:log:{sprite} events
  test('DISP-02: polls cs logs after cs dispatch exits with code 0 and sends log events', async () => {
    vi.useFakeTimers()

    const { registerDispatchHandlers } = await import('./dispatch')
    registerDispatchHandlers(mockBrowserWindow as never)

    const fakeProc = makeFakeProc()
    mockSpawnCsStreaming.mockReturnValue(fakeProc)

    // Mock cs logs to return some output
    mockSpawnCsCommand.mockResolvedValue({ code: 0, stdout: 'log line 1\nlog line 2\n', stderr: '' })

    const launchHandler = handlers.get('dispatch:launch')!
    const launchPromise = launchHandler({}, { sprite: 'test-sprite', prompt: 'run task', noSync: true })

    // cs dispatch exits successfully
    fakeProc.emit('close', 0)

    // Wait for close handler to run
    await Promise.resolve()

    const result = await launchPromise
    expect(result).toEqual({ started: true })

    // Advance timer by 1100ms to trigger the polling interval
    await vi.advanceTimersByTimeAsync(1100)

    // cs logs should have been called with the sprite name
    expect(mockSpawnCsCommand).toHaveBeenCalledWith(['logs', 'test-sprite'])

    // webContents.send should have been called with log lines
    expect(mockWebContentsSend).toHaveBeenCalledWith('dispatch:log:test-sprite', expect.stringContaining('log line 1'))
  })

  // DISP-03: dispatch:abort clears polling interval and spawns cs abort with sprite name
  test('DISP-03: dispatch:abort stops polling and runs cs abort', async () => {
    vi.useFakeTimers()

    const { registerDispatchHandlers } = await import('./dispatch')
    registerDispatchHandlers(mockBrowserWindow as never)

    // Start a dispatch first
    const fakeProc = makeFakeProc()
    mockSpawnCsStreaming.mockReturnValue(fakeProc)
    mockSpawnCsCommand.mockResolvedValue({ code: 0, stdout: '', stderr: '' })

    const launchHandler = handlers.get('dispatch:launch')!
    const launchPromise = launchHandler({}, { sprite: 'abort-sprite', prompt: 'task', noSync: true })

    fakeProc.emit('close', 0)
    await Promise.resolve()
    await launchPromise

    // Clear call history so we can check the abort call specifically
    mockSpawnCsCommand.mockClear()
    mockSpawnCsCommand.mockResolvedValue({ code: 0, stdout: '', stderr: '' })

    // Now abort
    const abortHandler = handlers.get('dispatch:abort')!
    const abortResult = await abortHandler({}, { sprite: 'abort-sprite' })

    expect(mockSpawnCsCommand).toHaveBeenCalledWith(['abort', 'abort-sprite'])
    expect(abortResult).toEqual({ code: 0 })
  })

  // DISP-04: Notification.show() called when DISPATCH_DONE detected in polled logs
  test('DISP-04: fires Notification when DISPATCH_DONE detected', async () => {
    vi.useFakeTimers()

    const { registerDispatchHandlers } = await import('./dispatch')
    registerDispatchHandlers(mockBrowserWindow as never)

    const { Notification } = await import('electron')

    const fakeProc = makeFakeProc()
    mockSpawnCsStreaming.mockReturnValue(fakeProc)

    // First poll returns a log with DISPATCH_DONE sentinel
    mockSpawnCsCommand.mockResolvedValue({
      code: 0,
      stdout: 'Claude finished\nDISPATCH_DONE\n',
      stderr: '',
    })

    const launchHandler = handlers.get('dispatch:launch')!
    const launchPromise = launchHandler({}, { sprite: 'done-sprite', prompt: 'test prompt', noSync: true })

    fakeProc.emit('close', 0)
    await Promise.resolve()
    await launchPromise

    // Advance timer to trigger polling
    await vi.advanceTimersByTimeAsync(1100)

    // Notification constructor should have been called
    expect(Notification).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Dispatch complete' })
    )

    // dispatch:done event should have been sent
    expect(mockWebContentsSend).toHaveBeenCalledWith('dispatch:done:done-sprite', { code: 0, success: true })
  })

  // SYNC-03: dispatch:launch respects autoSyncBeforeDispatch config flag
  test('SYNC-03: uses --no-sync when autoSyncBeforeDispatch is false in config', async () => {
    // Import config-store module first (same instance as will be used by dispatch module)
    const configStore = await import('../config-store')
    vi.mocked(configStore.loadConfig).mockResolvedValueOnce({
      spriteToken: 'tok',
      org: 'org',
      anthropicApiKey: 'key',
      autoSyncBeforeDispatch: false,
    })

    const { registerDispatchHandlers } = await import('./dispatch')
    registerDispatchHandlers(mockBrowserWindow as never)

    const fakeProc = makeFakeProc()
    mockSpawnCsStreaming.mockReturnValue(fakeProc)

    const launchHandler = handlers.get('dispatch:launch')!
    // noSync is undefined — handler should read config
    const launchPromise = launchHandler({}, { sprite: 'cfg-sprite', prompt: 'task' })

    // loadConfig is async, wait for it to resolve before checking spawn args
    await Promise.resolve()

    expect(mockSpawnCsStreaming).toHaveBeenCalledWith(['dispatch', 'task', 'cfg-sprite', '--no-sync'])

    fakeProc.emit('error', new Error('done'))
    await launchPromise
  })
})
