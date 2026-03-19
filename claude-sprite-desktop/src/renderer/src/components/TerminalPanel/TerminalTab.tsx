import { useRef } from 'react'
import { useTheme } from 'next-themes'
import '@xterm/xterm/css/xterm.css'
import { useTerminal } from './useTerminal'
import type { SpriteInfo } from '../../lib/sprite-types'

interface TerminalTabProps {
  sprite: SpriteInfo
  org: string
  active: boolean
}

export function TerminalTab({ sprite, org, active }: TerminalTabProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const { resolvedTheme } = useTheme()
  const theme = resolvedTheme === 'dark' ? 'dark' : 'light'

  useTerminal(containerRef, sprite.name, org, theme, active)

  return (
    <div
      ref={containerRef}
      style={{
        display: active ? 'block' : 'none',
        width: '100%',
        height: '100%',
        // Prevent xterm.js canvas from overflowing
        overflow: 'hidden',
      }}
    />
  )
}
