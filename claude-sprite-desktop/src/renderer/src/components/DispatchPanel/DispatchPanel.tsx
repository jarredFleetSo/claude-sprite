import { useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../ui/dialog'
import { Button } from '../ui/button'
import { Badge } from '../ui/badge'
import { useDispatch, DispatchStatus } from '../../hooks/useDispatch'
import { LogViewer } from './LogViewer'
import { useUIStore } from '../../store/ui'
import { Play, Square, RotateCcw } from 'lucide-react'

function statusColor(status: DispatchStatus): string {
  switch (status) {
    case 'launching':
      return 'bg-amber-500/15 text-amber-500'
    case 'running':
      return 'bg-green-500/15 text-green-500'
    case 'done':
      return 'bg-green-500/15 text-green-500'
    case 'failed':
      return 'bg-red-500/15 text-red-500'
    case 'aborted':
      return 'bg-yellow-500/15 text-yellow-500'
    default:
      return ''
  }
}

function statusLabel(status: DispatchStatus): string {
  switch (status) {
    case 'launching':
      return 'Launching...'
    case 'running':
      return 'Running'
    case 'done':
      return 'Complete'
    case 'failed':
      return 'Failed'
    case 'aborted':
      return 'Aborted'
    default:
      return ''
  }
}

export function DispatchPanel() {
  const { showDispatchPanel, setShowDispatchPanel, dispatchTarget } = useUIStore()
  const spriteName = dispatchTarget?.name ?? ''
  const { status, logs, launch, abort, reset } = useDispatch(spriteName)
  const [prompt, setPrompt] = useState('')
  const [noSync, setNoSync] = useState(false)

  const canLaunch = prompt.trim().length > 0 && ['idle', 'done', 'failed', 'aborted'].includes(status)
  const isActive = status === 'launching' || status === 'running'

  const handleLaunch = () => {
    if (!canLaunch) return
    launch(prompt.trim(), noSync)
  }

  const handleClose = () => {
    setShowDispatchPanel(false)
    // Reset if idle or terminal state
    if (!isActive) reset()
  }

  return (
    <Dialog
      open={showDispatchPanel}
      onOpenChange={(open) => {
        if (!open && !isActive) handleClose()
        else if (!open && isActive) {
          /* prevent close while running */
        } else setShowDispatchPanel(open)
      }}
    >
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <DialogTitle>Dispatch to {spriteName}</DialogTitle>
            {status !== 'idle' && (
              <Badge variant="outline" className={statusColor(status)}>
                {statusLabel(status)}
              </Badge>
            )}
          </div>
        </DialogHeader>

        <div className="space-y-4">
          {/* Prompt input */}
          <textarea
            className="w-full min-h-[100px] rounded-lg border border-border bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring resize-y"
            placeholder="What should Claude do?"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            disabled={isActive}
          />

          {/* Options row */}
          <div className="flex items-center justify-between">
            <label className="flex items-center gap-2 text-sm text-muted-foreground">
              <input
                type="checkbox"
                checked={noSync}
                onChange={(e) => setNoSync(e.target.checked)}
                disabled={isActive}
                className="rounded"
              />
              Skip file sync
            </label>

            <div className="flex gap-2">
              {isActive && (
                <Button variant="destructive" size="sm" onClick={abort}>
                  <Square className="h-3.5 w-3.5 mr-1.5" />
                  Abort
                </Button>
              )}
              {!isActive && status !== 'idle' && (
                <Button variant="outline" size="sm" onClick={reset}>
                  <RotateCcw className="h-3.5 w-3.5 mr-1.5" />
                  New dispatch
                </Button>
              )}
              <Button size="sm" onClick={handleLaunch} disabled={!canLaunch}>
                <Play className="h-3.5 w-3.5 mr-1.5" />
                Dispatch
              </Button>
            </div>
          </div>

          {/* Log viewer — shown when there's output */}
          {status !== 'idle' && <LogViewer lines={logs} className="h-80" />}
        </div>
      </DialogContent>
    </Dialog>
  )
}
