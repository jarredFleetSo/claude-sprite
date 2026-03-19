import { Server } from 'lucide-react'
import { Button } from './ui/button'
import { useUIStore } from '../store/ui'

export function EmptyState() {
  const setShowCreateModal = useUIStore((s) => s.setShowCreateModal)

  return (
    <div className="flex flex-col items-center justify-center min-h-[400px] text-center max-w-md mx-auto px-4">
      <Server className="h-16 w-16 text-muted-foreground/30 mb-6" />
      <h2 className="text-lg font-semibold mb-2">No sprites yet</h2>
      <p className="text-sm text-muted-foreground mb-6">
        Create your first sprite to get started with Claude Code
      </p>
      <Button onClick={() => setShowCreateModal(true)}>Create Sprite</Button>
    </div>
  )
}
