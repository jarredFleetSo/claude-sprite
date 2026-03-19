import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

interface StepOrgProps {
  initialOrg?: string
  onBack: () => void
  onNext: (org: string) => void
}

export function StepOrg({ initialOrg = '', onBack, onNext }: StepOrgProps) {
  const [org, setOrg] = useState(initialOrg)

  function handleNext() {
    const trimmed = org.trim()
    if (trimmed) {
      onNext(trimmed)
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="space-y-2">
        <h2 className="text-xl font-semibold">Your Organization</h2>
        <p className="text-sm text-muted-foreground">
          Your Sprites organization name. This is the Fly.io organization that owns your sprites.
        </p>
      </div>

      <div className="space-y-2">
        <label htmlFor="org-input" className="text-sm font-medium">
          Organization name
        </label>
        <Input
          id="org-input"
          value={org}
          onChange={(e) => setOrg(e.target.value)}
          placeholder="my-org"
          onKeyDown={(e) => e.key === 'Enter' && handleNext()}
          autoFocus
        />
      </div>

      <div className="flex gap-3">
        <Button variant="outline" onClick={onBack} className="flex-1">
          Back
        </Button>
        <Button onClick={handleNext} disabled={!org.trim()} className="flex-1">
          Next
        </Button>
      </div>
    </div>
  )
}
