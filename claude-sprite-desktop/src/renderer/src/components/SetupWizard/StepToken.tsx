import { useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'

interface StepTokenProps {
  onSuccess: () => void
}

export function StepToken({ onSuccess }: StepTokenProps) {
  const [loading, setLoading] = useState(false)

  async function handleLogin() {
    setLoading(true)
    try {
      const result = await window.spriteAPI.runSpriteLogin()
      if (result.success) {
        onSuccess()
      } else {
        toast.error(result.error ?? 'Login failed. Please try again.')
        setLoading(false)
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Login failed. Please try again.')
      setLoading(false)
    }
  }

  return (
    <div className="flex flex-col items-center gap-6">
      <div className="text-center space-y-2">
        <h2 className="text-xl font-semibold">Connect to Sprites</h2>
        <p className="text-sm text-muted-foreground max-w-xs">
          This will open your browser to authenticate with Sprites via your Fly.io account.
        </p>
      </div>

      <Button
        size="lg"
        className="w-full"
        onClick={handleLogin}
        disabled={loading}
      >
        {loading ? (
          <>
            <span className="animate-spin h-4 w-4 border-2 border-primary-foreground border-t-transparent rounded-full" />
            Waiting for browser authentication...
          </>
        ) : (
          'Connect with Sprite Login'
        )}
      </Button>

      {loading && (
        <p className="text-xs text-muted-foreground">
          Complete authentication in your browser, then return here.
        </p>
      )}
    </div>
  )
}
