import { Plus, RefreshCw } from 'lucide-react'
import { Button } from '../components/ui/button'
import { Card } from '../components/ui/card'
import { SpriteCard } from '../components/SpriteCard/SpriteCard'
import { EmptyState } from '../components/EmptyState'
import { CreateSpriteModal } from '../components/modals/CreateSpriteModal'
import { DestroyConfirmModal } from '../components/modals/DestroyConfirmModal'
import { useSprites } from '../hooks/useSprites'
import { useUIStore } from '../store/ui'

function SkeletonCard() {
  return (
    <Card className="p-4">
      <div className="animate-pulse space-y-3">
        <div className="flex items-center justify-between">
          <div className="h-4 bg-muted rounded w-1/3" />
          <div className="h-5 bg-muted rounded-full w-16" />
        </div>
        <div className="h-3 bg-muted rounded w-1/2" />
        <div className="flex gap-1">
          <div className="h-7 bg-muted rounded w-14" />
          <div className="h-7 bg-muted rounded w-20" />
          <div className="h-7 bg-muted rounded w-20" />
          <div className="h-7 bg-muted rounded w-16" />
        </div>
      </div>
    </Card>
  )
}

export function Dashboard() {
  const { data: sprites, isLoading, error, refetch } = useSprites()
  const setShowCreateModal = useUIStore((s) => s.setShowCreateModal)

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      {/* Header */}
      <header className="flex items-center justify-between border-b px-6 py-4">
        <h1 className="text-lg font-semibold">Claude Sprite</h1>
        <Button size="sm" onClick={() => setShowCreateModal(true)}>
          <Plus className="h-4 w-4 mr-2" />
          Create Sprite
        </Button>
      </header>

      {/* Error banner */}
      {error && (
        <div className="flex items-center justify-between bg-destructive/10 border-b border-destructive/20 px-6 py-2">
          <p className="text-sm text-destructive">Failed to load sprites. Retrying...</p>
          <Button variant="ghost" size="sm" onClick={() => refetch()}>
            <RefreshCw className="h-3 w-3 mr-1" />
            Retry
          </Button>
        </div>
      )}

      {/* Content */}
      <main className="flex-1 p-6">
        {isLoading && !sprites ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <SkeletonCard />
            <SkeletonCard />
            <SkeletonCard />
          </div>
        ) : sprites && sprites.length === 0 ? (
          <EmptyState />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {(sprites ?? []).map((sprite) => (
              <SpriteCard key={sprite.id} sprite={sprite} />
            ))}
          </div>
        )}
      </main>

      {/* Modals */}
      <CreateSpriteModal />
      <DestroyConfirmModal />
    </div>
  )
}
