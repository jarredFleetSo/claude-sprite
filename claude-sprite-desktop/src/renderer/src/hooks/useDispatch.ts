import { useState, useEffect, useCallback } from 'react'

export type DispatchStatus = 'idle' | 'launching' | 'running' | 'done' | 'failed' | 'aborted'

interface DispatchState {
  status: DispatchStatus
  logs: string[]
  exitCode: number | null
}

export function useDispatch(spriteName: string) {
  const [state, setState] = useState<DispatchState>({
    status: 'idle',
    logs: [],
    exitCode: null,
  })

  useEffect(() => {
    // Subscribe to log and done channels for this sprite
    const cleanLog = window.spriteAPI.onDispatchLog(spriteName, (line) => {
      setState((prev) => ({
        ...prev,
        status: prev.status === 'launching' ? 'running' : prev.status,
        // Cap at 2000 lines to prevent unbounded memory growth
        logs: [...prev.logs.slice(-1999), line],
      }))
    })
    const cleanDone = window.spriteAPI.onDispatchDone(spriteName, ({ code, success }) => {
      setState((prev) => ({
        ...prev,
        status: success ? 'done' : 'failed',
        exitCode: code,
      }))
    })
    return () => {
      cleanLog()
      cleanDone()
    }
  }, [spriteName])

  const launch = useCallback(
    async (prompt: string, noSync = false) => {
      setState({ status: 'launching', logs: [], exitCode: null })
      const result = await window.spriteAPI.dispatch(spriteName, prompt, noSync)
      if (!result.started) {
        setState((prev) => ({ ...prev, status: 'failed' }))
      }
      // If started, status transitions to 'running' when first log line arrives
    },
    [spriteName]
  )

  const abort = useCallback(async () => {
    await window.spriteAPI.abortDispatch(spriteName)
    setState((prev) => ({ ...prev, status: 'aborted' }))
  }, [spriteName])

  const reset = useCallback(() => {
    setState({ status: 'idle', logs: [], exitCode: null })
  }, [])

  return { ...state, launch, abort, reset }
}
