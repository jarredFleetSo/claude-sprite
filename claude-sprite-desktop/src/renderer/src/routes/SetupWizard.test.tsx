import { describe, test } from 'vitest'

describe('SetupWizard', () => {
  // SHELL-02: Setup wizard
  test.todo('renders Step 1 (sprite login) by default')
  test.todo('Step 1 has a Connect with Sprite Login button')
  test.todo('clicking Connect with Sprite Login invokes sprite:login IPC')
  test.todo('advances to Step 2 after successful login')
  test.todo('Step 2 shows org input')
  test.todo('Step 3 shows API key input')
  test.todo('completing Step 3 calls saveConfig with all three values')
  test.todo('accepts initialStep prop to skip to Step 3 for auto-import')
  test.todo('back button navigates to previous step')
})
