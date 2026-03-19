import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useSaveConfig } from '@/hooks/useConfig'

interface StepApiKeyProps {
  org: string
  onBack: () => void
  onComplete: () => void
}

export function StepApiKey({ org, onBack, onComplete }: StepApiKeyProps) {
  const [anthropicApiKey, setAnthropicApiKey] = useState('')
  const [saving, setSaving] = useState(false)
  const saveConfig = useSaveConfig()

  async function handleComplete() {
    const trimmed = anthropicApiKey.trim()
    if (!trimmed) return

    setSaving(true)
    try {
      // Save org and anthropicApiKey -- spriteToken already persisted by sprite login IPC
      await saveConfig.mutateAsync({ org, anthropicApiKey: trimmed })
      onComplete()
    } catch {
      setSaving(false)
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="space-y-2">
        <h2 className="text-xl font-semibold">Anthropic API Key</h2>
        <p className="text-sm text-muted-foreground">
          Your Anthropic API key for Claude Code. Find it at{' '}
          <span className="font-mono text-xs">console.anthropic.com</span>
        </p>
      </div>

      <div className="space-y-2">
        <label htmlFor="apikey-input" className="text-sm font-medium">
          API key
        </label>
        <Input
          id="apikey-input"
          type="password"
          value={anthropicApiKey}
          onChange={(e) => setAnthropicApiKey(e.target.value)}
          placeholder="sk-ant-..."
          onKeyDown={(e) => e.key === 'Enter' && handleComplete()}
          autoFocus
        />
      </div>

      <div className="flex gap-3">
        <Button variant="outline" onClick={onBack} className="flex-1">
          Back
        </Button>
        <Button
          onClick={handleComplete}
          disabled={!anthropicApiKey.trim() || saving}
          className="flex-1"
        >
          {saving ? (
            <>
              <span className="animate-spin h-4 w-4 border-2 border-primary-foreground border-t-transparent rounded-full" />
              Saving...
            </>
          ) : (
            'Complete Setup'
          )}
        </Button>
      </div>
    </div>
  )
}
