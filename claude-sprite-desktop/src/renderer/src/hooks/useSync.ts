import { useState, useEffect, useCallback } from 'react'
import { stripAnsi } from '../lib/ansi'

export type SyncStatus = 'idle' | 'pushing' | 'pulling' | 'done' | 'failed'
export type SyncDirection = 'push' | 'pull'

interface SyncState {
  status: SyncStatus
  direction: SyncDirection | null
  progressLines: string[]
  lastLine: string
}

export function useSync(spriteName: string) {
  const [state, setState] = useState<SyncState>({
    status: 'idle',
    direction: null,
    progressLines: [],
    lastLine: '',
  })

  useEffect(() => {
    const cleanProgress = window.spriteAPI.onSyncProgress(spriteName, (line) => {
      const cleaned = stripAnsi(line).trim()
      if (cleaned) {
        setState((prev) => ({
          ...prev,
          progressLines: [...prev.progressLines.slice(-99), cleaned],
          lastLine: cleaned,
        }))
      }
    })
    const cleanDone = window.spriteAPI.onSyncDone(spriteName, ({ success }) => {
      setState((prev) => ({
        ...prev,
        status: success ? 'done' : 'failed',
      }))
    })
    return () => {
      cleanProgress()
      cleanDone()
    }
  }, [spriteName])

  const push = useCallback(async () => {
    setState({ status: 'pushing', direction: 'push', progressLines: [], lastLine: '' })
    const result = await window.spriteAPI.syncPush(spriteName)
    if (!result.success) {
      setState((prev) => ({ ...prev, status: 'failed' }))
    }
  }, [spriteName])

  const pull = useCallback(async () => {
    setState({ status: 'pulling', direction: 'pull', progressLines: [], lastLine: '' })
    const result = await window.spriteAPI.syncPull(spriteName)
    if (!result.success) {
      setState((prev) => ({ ...prev, status: 'failed' }))
    }
  }, [spriteName])

  const reset = useCallback(() => {
    setState({ status: 'idle', direction: null, progressLines: [], lastLine: '' })
  }, [])

  return { ...state, push, pull, reset }
}
