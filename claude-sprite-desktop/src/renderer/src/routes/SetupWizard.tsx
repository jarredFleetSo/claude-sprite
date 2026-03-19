import { useState } from 'react'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { StepToken } from '@/components/SetupWizard/StepToken'
import { StepOrg } from '@/components/SetupWizard/StepOrg'
import { StepApiKey } from '@/components/SetupWizard/StepApiKey'

interface SetupWizardProps {
  initialStep?: number
  initialOrg?: string
  onComplete?: () => void
}

export default function SetupWizard({
  initialStep = 1,
  initialOrg = '',
  onComplete,
}: SetupWizardProps) {
  const [step, setStep] = useState(initialStep)
  const [org, setOrg] = useState(initialOrg)

  const totalSteps = 3

  function handleTokenSuccess() {
    // After browser OAuth completes, sprite login writes the token to the keyring.
    // The IPC handler reloads config -- we advance to collect org.
    setStep(2)
  }

  function handleOrgNext(orgValue: string) {
    setOrg(orgValue)
    setStep(3)
  }

  function handleComplete() {
    onComplete?.()
  }

  return (
    <div className="flex items-center justify-center min-h-screen bg-background">
      <div className="w-full max-w-md px-4">
        <div className="text-center mb-8 space-y-1">
          <h1 className="text-2xl font-bold tracking-tight">Claude Sprite</h1>
          <p className="text-sm text-muted-foreground">
            Step {step} of {totalSteps}
          </p>
        </div>

        {/* Step indicator */}
        <div className="flex gap-1.5 mb-8 justify-center">
          {Array.from({ length: totalSteps }, (_, i) => (
            <div
              key={i}
              className={`h-1 flex-1 max-w-[60px] rounded-full transition-colors ${
                i + 1 <= step ? 'bg-primary' : 'bg-muted'
              }`}
            />
          ))}
        </div>

        <Card>
          <CardHeader />
          <CardContent className="pb-8">
            {step === 1 && (
              <StepToken onSuccess={handleTokenSuccess} />
            )}
            {step === 2 && (
              <StepOrg
                initialOrg={org}
                onBack={() => setStep(1)}
                onNext={handleOrgNext}
              />
            )}
            {step === 3 && (
              <StepApiKey
                org={org}
                onBack={() => setStep(2)}
                onComplete={handleComplete}
              />
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
