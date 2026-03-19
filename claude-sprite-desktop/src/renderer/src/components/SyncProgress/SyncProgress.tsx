import { useEffect } from 'react'
import { Loader2, Check, X, Upload, Download } from 'lucide-react'
import { useSync, SyncStatus } from '../../hooks/useSync'
import { Button } from '../ui/button'

interface SyncProgressProps {
  spriteName: string
}

function StatusIcon({ status }: { status: SyncStatus; direction: 'push' | 'pull' | null }) {
  switch (status) {
    case 'pushing':
    case 'pulling':
      return <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
    case 'done':
      return <Check className="h-3.5 w-3.5 text-green-500" />
    case 'failed':
      return <X className="h-3.5 w-3.5 text-red-500" />
    default:
      return null
  }
}

export function SyncProgress({ spriteName }: SyncProgressProps) {
  const { status, direction, lastLine, push, pull, reset } = useSync(spriteName)

  // Auto-reset after 3 seconds on done/failed
  useEffect(() => {
    if (status === 'done' || status === 'failed') {
      const timer = setTimeout(reset, 3000)
      return () => clearTimeout(timer)
    }
    return undefined
  }, [status, reset])

  const isActive = status === 'pushing' || status === 'pulling'

  return (
    <div className="flex items-center gap-1.5">
      {/* Push button */}
      <Button
        variant="ghost"
        size="icon"
        className="h-7 w-7"
        onClick={push}
        disabled={isActive}
        title="Push files to sprite"
      >
        <Upload className="h-3.5 w-3.5" />
      </Button>

      {/* Pull button */}
      <Button
        variant="ghost"
        size="icon"
        className="h-7 w-7"
        onClick={pull}
        disabled={isActive}
        title="Pull files from sprite"
      >
        <Download className="h-3.5 w-3.5" />
      </Button>

      {/* Inline status */}
      {status !== 'idle' && (
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground max-w-[150px]">
          <StatusIcon status={status} direction={direction} />
          <span className="truncate">
            {isActive
              ? lastLine || (direction === 'push' ? 'Pushing...' : 'Pulling...')
              : status === 'done'
                ? 'Done'
                : 'Failed'}
          </span>
        </div>
      )}
    </div>
  )
}
