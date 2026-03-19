import { describe, test } from 'vitest'

describe('useSprites', () => {
  // DASH-07: Auto-polling
  test.todo('configures refetchInterval of 30000ms')
  test.todo('fetches from api.sprites.dev/v1/sprites with bearer token')
  test.todo('handles wrapped response { sprites: [...] }')
  test.todo('handles array response')
  test.todo('returns empty array when no config')
})
