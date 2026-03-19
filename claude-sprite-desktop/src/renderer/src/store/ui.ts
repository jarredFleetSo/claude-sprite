import { create } from 'zustand'
import type { SpriteInfo } from '../lib/sprite-types'

interface UIState {
  selectedSprite: SpriteInfo | null
  setSelectedSprite: (sprite: SpriteInfo | null) => void
  showCreateModal: boolean
  setShowCreateModal: (show: boolean) => void
  showDestroyModal: boolean
  setShowDestroyModal: (show: boolean) => void
  destroyTarget: SpriteInfo | null
  setDestroyTarget: (sprite: SpriteInfo | null) => void
}

export const useUIStore = create<UIState>((set) => ({
  selectedSprite: null,
  setSelectedSprite: (sprite) => set({ selectedSprite: sprite }),
  showCreateModal: false,
  setShowCreateModal: (show) => set({ showCreateModal: show }),
  showDestroyModal: false,
  setShowDestroyModal: (show) => set({ showDestroyModal: show }),
  destroyTarget: null,
  setDestroyTarget: (sprite) => set({ destroyTarget: sprite }),
}))
