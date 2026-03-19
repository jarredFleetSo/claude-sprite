import type { SpriteAPI } from './lib/sprite-types'
declare global {
  interface Window {
    spriteAPI: SpriteAPI
  }
}
