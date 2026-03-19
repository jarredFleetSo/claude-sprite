import { useState } from 'react'
import { AlertTriangle, Loader2 } from 'lucide-react'
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

export function DestroyConfirmModal() {
  const showDestroyModal = useUIStore((s) => s.showDestroyModal)
  const setShowDestroyModal = useUIStore((s) => s.setShowDestroyModal)
  const destroyTarget = useUIStore((s) => s.destroyTarget)
  const setDestroyTarget = useUIStore((s) => s.setDestroyTarget)
  const [confirmInput, setConfirmInput] = useState('')
  const [inProgress, setInProgress] = useState(false)
  const queryClient = useQueryClient()

  function handleClose() {
    if (inProgress) return
    setConfirmInput('')
    setDestroyTarget(null)
    setShowDestroyModal(false)
  }

  async function handleDestroy() {
    if (!destroyTarget) return
    if (confirmInput !== destroyTarget.name) return
    setInProgress(true)
    try {
      const result = await window.spriteAPI.lifecycle(
        destroyTarget.name,
        destroyTarget.organization,
        'destroy'
      )
      if (!result.success) throw new Error(result.error ?? 'Destroy failed')
      await queryClient.invalidateQueries({ queryKey: ['sprites'] })
      setConfirmInput('')
      setDestroyTarget(null)
      setShowDestroyModal(false)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to destroy sprite')
    } finally {
      setInProgress(false)
    }
  }

  if (!destroyTarget) return null

  const confirmed = confirmInput === destroyTarget.name

  return (
    <Dialog open={showDestroyModal} onOpenChange={(open) => !open && handleClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-2 mb-1">
            <AlertTriangle className="h-5 w-5 text-destructive flex-shrink-0" />
            <DialogTitle>Destroy {destroyTarget.name}?</DialogTitle>
          </div>
          <DialogDescription>
            This action cannot be undone. All data on this sprite will be permanently deleted.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-3 py-2">
          <p className="text-sm text-muted-foreground">
            Type <span className="font-mono font-medium text-foreground">{destroyTarget.name}</span>{' '}
            to confirm
          </p>
          <Input
            placeholder={destroyTarget.name}
            value={confirmInput}
            onChange={(e) => setConfirmInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && confirmed && !inProgress && handleDestroy()}
            disabled={inProgress}
            autoFocus
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={handleClose} disabled={inProgress}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={handleDestroy}
            disabled={!confirmed || inProgress}
          >
            {inProgress ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Destroying...
              </>
            ) : (
              'Destroy'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
