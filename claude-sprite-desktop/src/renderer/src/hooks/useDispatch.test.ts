// @vitest-environment jsdom
import { describe, test, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useDispatch } from './useDispatch'

// Mock window.spriteAPI
const mockLogCallback: { [sprite: string]: ((line: string) => void) | undefined } = {}
const mockDoneCallback: {
  [sprite: string]: ((result: { code: number | null; success: boolean }) => void) | undefined
} = {}

const mockDispatch = vi.fn().mockResolvedValue({ started: true })
const mockAbortDispatch = vi.fn().mockResolvedValue({ code: 0 })
const mockOnDispatchLog = vi.fn((sprite: string, cb: (line: string) => void) => {
  mockLogCallback[sprite] = cb
  return () => {
    delete mockLogCallback[sprite]
  }
})
const mockOnDispatchDone = vi.fn(
  (
    sprite: string,
    cb: (result: { code: number | null; success: boolean }) => void
  ) => {
    mockDoneCallback[sprite] = cb
    return () => {
      delete mockDoneCallback[sprite]
    }
  }
)

Object.defineProperty(window, 'spriteAPI', {
  value: {
    dispatch: mockDispatch,
    abortDispatch: mockAbortDispatch,
    onDispatchLog: mockOnDispatchLog,
    onDispatchDone: mockOnDispatchDone,
  },
  writable: true,
})

beforeEach(() => {
  mockDispatch.mockReset()
  mockDispatch.mockResolvedValue({ started: true })
  mockAbortDispatch.mockReset()
  mockAbortDispatch.mockResolvedValue({ code: 0 })
  mockOnDispatchLog.mockClear()
  mockOnDispatchDone.mockClear()
  // Clean up captured callbacks
  for (const key of Object.keys(mockLogCallback)) delete mockLogCallback[key]
  for (const key of Object.keys(mockDoneCallback)) delete mockDoneCallback[key]
})

describe('useDispatch', () => {
  test('1. initial state: status idle, logs empty, exitCode null', () => {
    const { result } = renderHook(() => useDispatch('my-sprite'))
    expect(result.current.status).toBe('idle')
    expect(result.current.logs).toEqual([])
    expect(result.current.exitCode).toBeNull()
  })

  test('2. launch sets status to launching', async () => {
    const { result } = renderHook(() => useDispatch('my-sprite'))
    await act(async () => {
      result.current.launch('do something')
    })
    // After launch starts (before dispatch promise resolves and before log arrives)
    // The state was set to launching synchronously inside launch
    expect(result.current.status).toBe('launching')
  })

  test('3. log line transitions status from launching to running and appends log', async () => {
    const { result } = renderHook(() => useDispatch('my-sprite'))
    // Pause dispatch so we can fire a log while still launching
    let resolveDispatch!: (v: { started: boolean }) => void
    mockDispatch.mockReturnValue(new Promise((res) => (resolveDispatch = res)))

    await act(async () => {
      result.current.launch('do something')
    })
    expect(result.current.status).toBe('launching')

    await act(async () => {
      mockLogCallback['my-sprite']?.('first log line\n')
    })
    expect(result.current.status).toBe('running')
    expect(result.current.logs).toEqual(['first log line\n'])

    // Resolve the dispatch promise
    await act(async () => {
      resolveDispatch({ started: true })
    })
  })

  test('4. log accumulation capped at 2000 lines', async () => {
    const { result } = renderHook(() => useDispatch('my-sprite'))

    await act(async () => {
      result.current.launch('do something')
    })

    // Simulate 2100 log lines
    await act(async () => {
      for (let i = 0; i < 2100; i++) {
        mockLogCallback['my-sprite']?.(`line ${i}\n`)
      }
    })

    expect(result.current.logs.length).toBe(2000)
    // Should retain the last 2000 lines
    expect(result.current.logs[result.current.logs.length - 1]).toBe('line 2099\n')
  })

  test('5a. done callback with success:true sets status to done', async () => {
    const { result } = renderHook(() => useDispatch('my-sprite'))

    await act(async () => {
      result.current.launch('do something')
    })

    await act(async () => {
      mockDoneCallback['my-sprite']?.({ code: 0, success: true })
    })

    expect(result.current.status).toBe('done')
    expect(result.current.exitCode).toBe(0)
  })

  test('5b. done callback with success:false sets status to failed', async () => {
    const { result } = renderHook(() => useDispatch('my-sprite'))

    await act(async () => {
      result.current.launch('do something')
    })

    await act(async () => {
      mockDoneCallback['my-sprite']?.({ code: 1, success: false })
    })

    expect(result.current.status).toBe('failed')
    expect(result.current.exitCode).toBe(1)
  })

  test('6. abort calls abortDispatch with spriteName (no org) and sets status to aborted', async () => {
    const { result } = renderHook(() => useDispatch('my-sprite'))

    await act(async () => {
      result.current.launch('do something')
    })
    await act(async () => {
      mockLogCallback['my-sprite']?.('running...\n')
    })
    expect(result.current.status).toBe('running')

    await act(async () => {
      result.current.abort()
    })

    expect(mockAbortDispatch).toHaveBeenCalledWith('my-sprite')
    expect(mockAbortDispatch).not.toHaveBeenCalledWith(
      expect.anything(),
      expect.anything()
    ) // no second arg (no org)
    expect(result.current.status).toBe('aborted')
  })

  test('7. reset returns to idle state with empty logs', async () => {
    const { result } = renderHook(() => useDispatch('my-sprite'))

    await act(async () => {
      result.current.launch('do something')
    })
    await act(async () => {
      mockDoneCallback['my-sprite']?.({ code: 0, success: true })
    })
    expect(result.current.status).toBe('done')

    act(() => {
      result.current.reset()
    })

    expect(result.current.status).toBe('idle')
    expect(result.current.logs).toEqual([])
    expect(result.current.exitCode).toBeNull()
  })

  test('8. failed launch: dispatch returns started:false → status becomes failed', async () => {
    mockDispatch.mockResolvedValue({ started: false })
    const { result } = renderHook(() => useDispatch('my-sprite'))

    await act(async () => {
      await result.current.launch('do something')
    })

    expect(result.current.status).toBe('failed')
  })
})
