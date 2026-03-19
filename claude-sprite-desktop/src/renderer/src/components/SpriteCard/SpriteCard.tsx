import { useState, useEffect } from 'react'
import { formatDistanceToNow } from 'date-fns'
import { Play, Square, Trash2, Terminal, Zap, Loader2 } from 'lucide-react'
import { Card, CardContent, CardHeader } from '../ui/card'
import { Button } from '../ui/button'
import { StatusBadge } from './StatusBadge'
import { categorizeStatus } from '../../lib/sprite-types'
import { useSpriteLifecycle } from '../../hooks/useSprites'
import { useUIStore } from '../../store/ui'
import type { SpriteInfo } from '../../lib/sprite-types'

interface SpriteCardProps {
  sprite: SpriteInfo
}

export function SpriteCard({ sprite }: SpriteCardProps) {
  const [actionInProgress, setActionInProgress] = useState<string | null>(null)
  const [progressMsg, setProgressMsg] = useState<string>('')
  const lifecycle = useSpriteLifecycle()
  const { setDestroyTarget, setShowDestroyModal } = useUIStore()
  const category = categorizeStatus(sprite.status)

  useEffect(() => {
    const cleanup = window.spriteAPI.onLifecycleProgress((msg) => {
      setProgressMsg(msg)
    })
    return cleanup
  }, [])

  const lastActive = sprite.last_running_at
    ? formatDistanceToNow(new Date(sprite.last_running_at), { addSuffix: true })
    : 'Never'

  async function handleStart() {
    setActionInProgress('start')
    setProgressMsg('Starting...')
    await lifecycle.mutateAsync({ sprite: sprite.name, org: sprite.organization, action: 'start' })
    setActionInProgress(null)
    setProgressMsg('')
  }

  async function handleStop() {
    setActionInProgress('stop')
    setProgressMsg('Stopping...')
    await lifecycle.mutateAsync({ sprite: sprite.name, org: sprite.organization, action: 'stop' })
    setActionInProgress(null)
    setProgressMsg('')
  }

  function handleDestroy() {
    setDestroyTarget(sprite)
    setShowDestroyModal(true)
  }

  const isInProgress = actionInProgress !== null

  return (
    <Card className="transition-shadow hover:shadow-md">
      <CardHeader className="pb-2 pt-4 px-4">
        <div className="flex items-center justify-between gap-2">
          <span className="font-medium text-sm truncate">{sprite.name}</span>
          <StatusBadge status={sprite.status} />
        </div>
        <p className="text-xs text-muted-foreground mt-1">
          {isInProgress ? progressMsg : `Active ${lastActive}`}
        </p>
      </CardHeader>
      <CardContent className="px-4 pb-4 pt-0">
        <div className="flex items-center gap-1">
          {category === 'running' ? (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-xs"
              disabled={isInProgress}
              onClick={handleStop}
            >
              {actionInProgress === 'stop' ? (
                <Loader2 className="h-3 w-3 mr-1 animate-spin" />
              ) : (
                <Square className="h-3 w-3 mr-1" />
              )}
              {actionInProgress === 'stop' ? 'Stopping...' : 'Stop'}
            </Button>
          ) : (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-xs"
              disabled={isInProgress}
              onClick={handleStart}
            >
              {actionInProgress === 'start' ? (
                <Loader2 className="h-3 w-3 mr-1 animate-spin" />
              ) : (
                <Play className="h-3 w-3 mr-1" />
              )}
              {actionInProgress === 'start' ? 'Starting...' : 'Start'}
            </Button>
          )}
          <Button
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-xs"
            disabled
            title="Coming in Phase 2"
          >
            <Terminal className="h-3 w-3 mr-1" />
            Terminal
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-xs"
            disabled
            title="Coming in Phase 3"
          >
            <Zap className="h-3 w-3 mr-1" />
            Dispatch
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-xs text-destructive hover:text-destructive"
            disabled={isInProgress}
            onClick={handleDestroy}
          >
            <Trash2 className="h-3 w-3 mr-1" />
            Destroy
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
