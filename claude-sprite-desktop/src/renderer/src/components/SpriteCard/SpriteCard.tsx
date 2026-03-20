import { useState, useEffect } from 'react'
import { formatDistanceToNow } from 'date-fns'
import { useQueryClient } from '@tanstack/react-query'
import { Play, Square, Trash2, Terminal, Zap, Loader2, FolderOpen } from 'lucide-react'
import { Card, CardContent, CardHeader } from '../ui/card'
import { Button } from '../ui/button'
import { StatusBadge } from './StatusBadge'
import { categorizeStatus } from '../../lib/sprite-types'
import { useSpriteLifecycle } from '../../hooks/useSprites'
import { useConfig } from '../../hooks/useConfig'
import { useUIStore } from '../../store/ui'
import { SyncProgress } from '../SyncProgress/SyncProgress'
import type { SpriteInfo } from '../../lib/sprite-types'

interface SpriteCardProps {
  sprite: SpriteInfo
}

export function SpriteCard({ sprite }: SpriteCardProps) {
  const [actionInProgress, setActionInProgress] = useState<string | null>(null)
  const [progressMsg, setProgressMsg] = useState<string>('')
  const lifecycle = useSpriteLifecycle()
  const queryClient = useQueryClient()
  const { data: config } = useConfig()
  const { setDestroyTarget, setShowDestroyModal, setDispatchTarget, setShowDispatchPanel, addTerminalTab } = useUIStore()
  const category = categorizeStatus(sprite.status)

  const projectPath = config?.spriteProjects?.[sprite.name] || ''
  const projectName = projectPath ? projectPath.split('/').pop() : ''

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

  async function handleSetProject() {
    const result = await window.spriteAPI.pickFolder()
    if (result) {
      const projects = { ...(config?.spriteProjects || {}), [sprite.name]: result }
      await window.spriteAPI.saveConfig({ spriteProjects: projects })
      await queryClient.invalidateQueries({ queryKey: ['config'] })
    }
  }

  const isInProgress = actionInProgress !== null

  return (
    <Card className="transition-shadow hover:shadow-md overflow-hidden">
      <CardHeader className="pb-2 pt-4 px-4">
        <div className="flex items-center justify-between gap-2">
          <span className="font-medium text-sm truncate">{sprite.name}</span>
          <StatusBadge status={sprite.status} />
        </div>
        <p className="text-xs text-muted-foreground mt-1">
          {isInProgress ? progressMsg : `Active ${lastActive}`}
        </p>
        {/* Project path */}
        <button
          className="flex items-center gap-1 mt-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
          onClick={handleSetProject}
          title="Set project directory for this sprite"
        >
          <FolderOpen className="h-3 w-3 shrink-0" />
          <span className="truncate">{projectName || 'Set project folder...'}</span>
        </button>
      </CardHeader>
      <CardContent className="px-4 pb-4 pt-0">
        <div className="flex items-center gap-1 flex-wrap">
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
            disabled={category !== 'running' || isInProgress}
            title={category !== 'running' ? 'Start sprite to open terminal' : undefined}
            onClick={() => addTerminalTab(sprite)}
          >
            <Terminal className="h-3 w-3 mr-1" />
            Terminal
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-xs"
            onClick={() => {
              setDispatchTarget(sprite)
              setShowDispatchPanel(true)
            }}
          >
            <Zap className="h-3 w-3 mr-1" />
            Dispatch
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-xs text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300"
            disabled={isInProgress}
            onClick={handleDestroy}
          >
            <Trash2 className="h-3 w-3 mr-1" />
            Destroy
          </Button>
          {category === 'running' && (
            <SyncProgress spriteName={sprite.name} />
          )}
        </div>
      </CardContent>
    </Card>
  )
}
