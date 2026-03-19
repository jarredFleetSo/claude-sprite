import { useEffect, useRef } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { useUIStore } from '../../store/ui'
import { DARK_THEME, LIGHT_THEME } from './themes'

type ThemeMode = 'dark' | 'light'

interface UseTerminalResult {
  termRef: React.MutableRefObject<Terminal | null>
}

// Track which session ID is current per sprite to prevent stale cleanups
let sessionCounter = 0

export function useTerminal(
  containerRef: React.RefObject<HTMLDivElement | null>,
  sprite: string,
  org: string,
  theme: ThemeMode,
  active: boolean
): UseTerminalResult {
  const termRef = useRef<Terminal | null>(null)
  const fitAddonRef = useRef<FitAddon | null>(null)
  const updateTerminalTabStatus = useUIStore((s) => s.updateTerminalTabStatus)
  const firstDataRef = useRef(false)

  // Main lifecycle effect
  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    // Track this specific session
    const mySession = ++sessionCounter
    let cleaned = false

    firstDataRef.current = false

    const fitAddon = new FitAddon()

    const term = new Terminal({
      fontFamily: 'ui-monospace, "Cascadia Code", "Fira Code", monospace',
      fontSize: 13,
      cursorStyle: 'bar',
      scrollback: 5000,
      theme: theme === 'dark' ? DARK_THEME : LIGHT_THEME,
    })

    term.loadAddon(fitAddon)
    term.open(container)

    fitAddonRef.current = fitAddon
    termRef.current = term

    // Small delay to let DOM settle, then open PTY
    const openTimer = setTimeout(() => {
      if (cleaned) return
      fitAddon.fit()
      const { cols, rows } = term
      console.log(`[useTerminal] Session ${mySession}: Opening PTY for ${sprite} (${cols}x${rows})`)
      window.spriteAPI.terminalOpen(sprite, org, cols, rows).then((r) => {
        console.log(`[useTerminal] Session ${mySession}: terminalOpen result:`, r)
      }).catch((err) => {
        console.error(`[useTerminal] Session ${mySession}: terminalOpen error:`, err)
      })
    }, 200)

    // Keystrokes → IPC
    const dataDispose = term.onData((data) => {
      if (!cleaned) window.spriteAPI.terminalInput(sprite, data)
    })

    // PTY output → xterm.js
    const cleanupOutput = window.spriteAPI.onTerminalOutput(sprite, (data) => {
      if (!cleaned) {
        term.write(data)
        if (!firstDataRef.current) {
          firstDataRef.current = true
          updateTerminalTabStatus(sprite, 'connected')
        }
      }
    })

    // PTY exited
    const cleanupExit = window.spriteAPI.onTerminalExit(sprite, () => {
      if (!cleaned) {
        term.write('\r\n[Connection closed]\r\n')
        updateTerminalTabStatus(sprite, 'disconnected')
      }
    })

    // Resize observer (debounced)
    let resizeTimer: ReturnType<typeof setTimeout> | null = null
    const observer = new ResizeObserver(() => {
      if (cleaned || !containerRef.current) return
      if (resizeTimer) clearTimeout(resizeTimer)
      resizeTimer = setTimeout(() => {
        if (cleaned) return
        fitAddon.fit()
        window.spriteAPI.terminalResize(sprite, term.cols, term.rows)
      }, 150)
    })
    observer.observe(container)

    return () => {
      cleaned = true
      clearTimeout(openTimer)
      if (resizeTimer) clearTimeout(resizeTimer)
      dataDispose.dispose()
      cleanupOutput()
      cleanupExit()
      observer.disconnect()
      // Only close if this is still the current session for this sprite
      if (mySession === sessionCounter) {
        console.log(`[useTerminal] Session ${mySession}: Closing PTY for ${sprite}`)
        window.spriteAPI.terminalClose(sprite)
      } else {
        console.log(`[useTerminal] Session ${mySession}: Skipping close (superseded by ${sessionCounter})`)
      }
      term.dispose()
      termRef.current = null
      fitAddonRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sprite, org])

  // Theme changes
  useEffect(() => {
    if (termRef.current) {
      termRef.current.options.theme = theme === 'dark' ? DARK_THEME : LIGHT_THEME
    }
  }, [theme])

  // Re-fit when tab becomes active
  useEffect(() => {
    if (active && fitAddonRef.current) {
      requestAnimationFrame(() => {
        fitAddonRef.current?.fit()
        if (termRef.current) {
          window.spriteAPI.terminalResize(sprite, termRef.current.cols, termRef.current.rows)
        }
      })
    }
  }, [active, sprite])

  return { termRef }
}
