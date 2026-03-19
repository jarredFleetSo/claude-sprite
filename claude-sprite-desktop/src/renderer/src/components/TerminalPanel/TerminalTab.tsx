import { useRef, Component, type ReactNode } from 'react'
import { useTheme } from 'next-themes'
import { useTerminal } from './useTerminal'
import type { SpriteInfo } from '../../lib/sprite-types'

// Error boundary to catch xterm.js crashes
class TerminalErrorBoundary extends Component<
  { children: ReactNode; sprite: string },
  { error: Error | null }
> {
  state = { error: null as Error | null }
  static getDerivedStateFromError(error: Error) {
    return { error }
  }
  render() {
    if (this.state.error) {
      return (
        <div className="flex items-center justify-center h-full text-sm text-destructive p-4">
          <div>
            <p className="font-medium">Terminal failed to load</p>
            <p className="text-xs text-muted-foreground mt-1">{this.state.error.message}</p>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}

interface TerminalTabProps {
  sprite: SpriteInfo
  org: string
  active: boolean
}

function TerminalTabInner({ sprite, org, active }: TerminalTabProps) {
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
        overflow: 'hidden',
      }}
    />
  )
}

export function TerminalTab(props: TerminalTabProps) {
  return (
    <TerminalErrorBoundary sprite={props.sprite.name}>
      <TerminalTabInner {...props} />
    </TerminalErrorBoundary>
  )
}
