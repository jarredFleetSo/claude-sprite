import { X } from 'lucide-react'
import { useUIStore } from '../../store/ui'
import { TerminalTab } from './TerminalTab'

function StatusDot({ status }: { status: 'connecting' | 'connected' | 'disconnected' }) {
  const colorClass =
    status === 'connected'
      ? 'bg-green-500'
      : status === 'connecting'
        ? 'bg-amber-400 animate-pulse'
        : 'bg-muted-foreground/40'
  return <span className={`inline-block w-1.5 h-1.5 rounded-full ${colorClass}`} />
}

export function TerminalPanel() {
  const {
    terminalTabs,
    activeTerminalSprite,
    setActiveTerminalSprite,
    removeTerminalTab,
    setShowTerminalPanel,
  } = useUIStore()

  function handleCloseAll() {
    // Remove all tabs — store already auto-hides panel when empty, but call explicitly
    terminalTabs.forEach((tab) => removeTerminalTab(tab.sprite.name))
    setShowTerminalPanel(false)
  }

  return (
    <div className="flex flex-col h-full">
      {/* Tab bar */}
      <div className="flex items-center border-b border-border bg-background shrink-0">
        {/* Scrollable tab list */}
        <div className="flex items-center overflow-x-auto flex-1 min-w-0">
          {terminalTabs.map((tab) => {
            const isActive = tab.sprite.name === activeTerminalSprite
            return (
              <button
                key={tab.sprite.name}
                className={`flex items-center gap-1.5 px-3 py-2 text-xs whitespace-nowrap border-r border-border shrink-0 transition-colors ${
                  isActive
                    ? 'bg-muted text-foreground'
                    : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
                }`}
                onClick={() => setActiveTerminalSprite(tab.sprite.name)}
              >
                <StatusDot status={tab.status} />
                <span className="max-w-[120px] truncate">{tab.sprite.name}</span>
                <button
                  className="ml-1 rounded hover:bg-destructive/15 hover:text-destructive p-0.5 transition-colors"
                  onClick={(e) => {
                    e.stopPropagation()
                    removeTerminalTab(tab.sprite.name)
                  }}
                  title={`Close ${tab.sprite.name}`}
                >
                  <X className="h-3 w-3" />
                </button>
              </button>
            )
          })}
        </div>

        {/* Close-all button */}
        <button
          className="flex items-center justify-center w-8 h-8 shrink-0 text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
          onClick={handleCloseAll}
          title="Close all terminals"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Terminal instances — all rendered, toggled via active prop (display: none/block) */}
      <div className="flex-1 relative overflow-hidden">
        {terminalTabs.map((tab) => (
          <div
            key={tab.sprite.name}
            style={{
              position: 'absolute',
              inset: 0,
              display: tab.sprite.name === activeTerminalSprite ? 'flex' : 'none',
              flexDirection: 'column',
            }}
          >
            <TerminalTab
              sprite={tab.sprite}
              org={tab.sprite.organization}
              active={tab.sprite.name === activeTerminalSprite}
            />
          </div>
        ))}
      </div>
    </div>
  )
}
