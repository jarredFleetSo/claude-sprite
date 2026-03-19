import { useEffect, useRef } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { WebglAddon } from '@xterm/addon-webgl'
import { Unicode11Addon } from '@xterm/addon-unicode11'
import { useUIStore } from '../../store/ui'
import { DARK_THEME, LIGHT_THEME } from './themes'

type ThemeMode = 'dark' | 'light'

interface UseTerminalResult {
  termRef: React.MutableRefObject<Terminal | null>
}

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

  // Main lifecycle effect — mount/unmount only
  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    firstDataRef.current = false

    const fitAddon = new FitAddon()
    const unicode11 = new Unicode11Addon()

    const term = new Terminal({
      fontFamily: 'ui-monospace, "Cascadia Code", "Fira Code", monospace',
      fontSize: 13,
      cursorStyle: 'bar',
      scrollback: 5000,
      theme: theme === 'dark' ? DARK_THEME : LIGHT_THEME,
    })

    term.loadAddon(fitAddon)
    term.loadAddon(unicode11)
    term.unicode.activeVersion = '11'

    term.open(container)

    // WebGL renderer — load after open() so canvas exists in DOM
    try {
      const webgl = new WebglAddon()
      term.loadAddon(webgl)
    } catch {
      // WebGL unavailable — canvas renderer is the fallback
    }

    fitAddonRef.current = fitAddon
    termRef.current = term

    // Fit after DOM is laid out (non-zero dimensions), then open PTY
    requestAnimationFrame(() => {
      fitAddon.fit()
      const { cols, rows } = term
      window.spriteAPI.terminalOpen(sprite, org, cols, rows)
    })

    // Keystrokes → IPC → PTY
    const dataDispose = term.onData((data) => {
      window.spriteAPI.terminalInput(sprite, data)
    })

    // PTY output → xterm.js; update status to 'connected' on first data
    const cleanupOutput = window.spriteAPI.onTerminalOutput(sprite, (data) => {
      term.write(data)
      if (!firstDataRef.current) {
        firstDataRef.current = true
        updateTerminalTabStatus(sprite, 'connected')
      }
    })

    // PTY exited
    const cleanupExit = window.spriteAPI.onTerminalExit(sprite, () => {
      term.write('\r\n[Connection closed]\r\n')
      updateTerminalTabStatus(sprite, 'disconnected')
    })

    // Resize: ResizeObserver → FitAddon → IPC (100ms debounce)
    let resizeTimer: ReturnType<typeof setTimeout> | null = null
    const observer = new ResizeObserver(() => {
      if (!containerRef.current) return
      if (resizeTimer) clearTimeout(resizeTimer)
      resizeTimer = setTimeout(() => {
        fitAddon.fit()
        window.spriteAPI.terminalResize(sprite, term.cols, term.rows)
      }, 100)
    })
    observer.observe(container)

    return () => {
      if (resizeTimer) clearTimeout(resizeTimer)
      dataDispose.dispose()
      cleanupOutput()
      cleanupExit()
      observer.disconnect()
      window.spriteAPI.terminalClose(sprite)
      term.dispose()
      termRef.current = null
      fitAddonRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sprite, org])

  // Theme changes — update options without remounting
  useEffect(() => {
    if (termRef.current) {
      termRef.current.options.theme = theme === 'dark' ? DARK_THEME : LIGHT_THEME
    }
  }, [theme])

  // Re-fit when tab becomes active (panel may have resized while hidden)
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
