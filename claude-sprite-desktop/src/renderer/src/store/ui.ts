import { create } from 'zustand'
import type { SpriteInfo, TerminalTabInfo } from '../lib/sprite-types'

interface UIState {
  selectedSprite: SpriteInfo | null
  setSelectedSprite: (sprite: SpriteInfo | null) => void
  showCreateModal: boolean
  setShowCreateModal: (show: boolean) => void
  showDestroyModal: boolean
  setShowDestroyModal: (show: boolean) => void
  destroyTarget: SpriteInfo | null
  setDestroyTarget: (sprite: SpriteInfo | null) => void
  showDispatchPanel: boolean
  setShowDispatchPanel: (show: boolean) => void
  dispatchTarget: SpriteInfo | null
  setDispatchTarget: (sprite: SpriteInfo | null) => void
  // Terminal panel + tab state
  showTerminalPanel: boolean
  setShowTerminalPanel: (show: boolean) => void
  terminalTabs: TerminalTabInfo[]
  addTerminalTab: (sprite: SpriteInfo) => void
  removeTerminalTab: (spriteName: string) => void
  updateTerminalTabStatus: (spriteName: string, status: TerminalTabInfo['status']) => void
  activeTerminalSprite: string | null
  setActiveTerminalSprite: (name: string | null) => void
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
  showDispatchPanel: false,
  setShowDispatchPanel: (show) => set({ showDispatchPanel: show }),
  dispatchTarget: null,
  setDispatchTarget: (sprite) => set({ dispatchTarget: sprite }),
  // Terminal panel + tab state
  showTerminalPanel: false,
  setShowTerminalPanel: (show) => set({ showTerminalPanel: show }),
  terminalTabs: [],
  addTerminalTab: (sprite) => set((state) => {
    const existing = state.terminalTabs.find((t) => t.sprite.name === sprite.name)
    if (existing) {
      // Tab already exists — just switch to it
      return { activeTerminalSprite: sprite.name }
    }
    const newTab: TerminalTabInfo = { sprite, status: 'connecting' }
    return {
      terminalTabs: [...state.terminalTabs, newTab],
      showTerminalPanel: true,
      activeTerminalSprite: sprite.name,
    }
  }),
  removeTerminalTab: (spriteName) => set((state) => {
    const remaining = state.terminalTabs.filter((t) => t.sprite.name !== spriteName)
    const wasActive = state.activeTerminalSprite === spriteName
    const nextActive = wasActive
      ? (remaining.length > 0 ? remaining[remaining.length - 1].sprite.name : null)
      : state.activeTerminalSprite
    return {
      terminalTabs: remaining,
      activeTerminalSprite: nextActive,
      showTerminalPanel: remaining.length > 0,
    }
  }),
  updateTerminalTabStatus: (spriteName, status) => set((state) => ({
    terminalTabs: state.terminalTabs.map((t) =>
      t.sprite.name === spriteName ? { ...t, status } : t
    ),
  })),
  activeTerminalSprite: null,
  setActiveTerminalSprite: (name) => set({ activeTerminalSprite: name }),
}))

