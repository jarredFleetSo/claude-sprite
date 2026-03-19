import { useState, useEffect, useRef } from 'react'
import { Loader2 } from 'lucide-react'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '../ui/dialog'
import { Button } from '../ui/button'
import { Input } from '../ui/input'
import { useUIStore } from '../../store/ui'

export function CreateSpriteModal() {
  const showCreateModal = useUIStore((s) => s.showCreateModal)
  const setShowCreateModal = useUIStore((s) => s.setShowCreateModal)
  const [name, setName] = useState('')
  const [inProgress, setInProgress] = useState(false)
  const [progressMsg, setProgressMsg] = useState('')
  const queryClient = useQueryClient()
  const cleanupRef = useRef<(() => void) | null>(null)

  useEffect(() => {
    if (showCreateModal) {
      cleanupRef.current = window.spriteAPI.onLifecycleProgress((msg) => {
        setProgressMsg(msg)
      })
    }
    return () => {
      if (cleanupRef.current) {
        cleanupRef.current()
        cleanupRef.current = null
      }
    }
  }, [showCreateModal])

  function handleClose() {
    if (inProgress) return
    setName('')
    setProgressMsg('')
    setShowCreateModal(false)
  }

  async function handleCreate() {
    if (!name.trim()) return
    setInProgress(true)
    setProgressMsg('Creating...')
    try {
      const config = await window.spriteAPI.loadConfig()
      if (!config) throw new Error('No config loaded')
      const result = await window.spriteAPI.lifecycle(name.trim(), config.org, 'create')
      if (!result.success) throw new Error(result.error ?? 'Create failed')
      await queryClient.invalidateQueries({ queryKey: ['sprites'] })
      setName('')
      setProgressMsg('')
      setShowCreateModal(false)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to create sprite')
      setProgressMsg('')
    } finally {
      setInProgress(false)
    }
  }

  return (
    <Dialog open={showCreateModal} onOpenChange={(open) => !open && handleClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Create Sprite</DialogTitle>
          <DialogDescription>
            Enter a name for your new sprite. It will be provisioned and ready to use.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-3 py-2">
          <Input
            placeholder="my-sprite"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && !inProgress && handleCreate()}
            disabled={inProgress}
            autoFocus
          />
          {progressMsg && (
            <p className="text-xs text-muted-foreground">{progressMsg}</p>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={handleClose} disabled={inProgress}>
            Cancel
          </Button>
          <Button onClick={handleCreate} disabled={inProgress || !name.trim()}>
            {inProgress ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Creating...
              </>
            ) : (
              'Create'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
