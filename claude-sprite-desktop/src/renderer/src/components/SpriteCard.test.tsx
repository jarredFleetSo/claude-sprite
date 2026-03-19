import { describe, test } from 'vitest'

describe('SpriteCard', () => {
  // DASH-01: Status badges
  test.todo('renders sprite name')
  test.todo('renders green badge for running status')
  test.todo('renders amber badge for cold status')
  test.todo('renders red/gray badge for unknown status')
  test.todo('renders last active time using formatDistanceToNow')
  test.todo('renders "Never" when last_running_at is null')

  // DASH-06: Quick action buttons
  test.todo('shows Start button for cold sprites')
  test.todo('shows Stop button for running sprites')
  test.todo('shows Destroy button for all sprites')
  test.todo('disables action buttons while action is in progress')
})
