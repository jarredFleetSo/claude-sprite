import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import type { SpriteInfo } from '../lib/sprite-types'

export function useSprites() {
  return useQuery({
    queryKey: ['sprites'],
    queryFn: async (): Promise<SpriteInfo[]> => {
      const config = await window.spriteAPI.loadConfig()
      if (!config?.spriteToken) return []
      const res = await fetch('https://api.sprites.dev/v1/sprites', {
        headers: { Authorization: `Bearer ${config.spriteToken}` },
      })
      if (!res.ok) throw new Error(`Sprite API ${res.status}`)
      const data = await res.json()
      return Array.isArray(data) ? data : (data.sprites ?? [])
    },
    refetchInterval: 30_000,
    refetchIntervalInBackground: true,
    staleTime: 10_000,
    retry: 2,
  })
}

export function useSpriteLifecycle() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({
      sprite,
      org,
      action,
    }: {
      sprite: string
      org: string
      action: 'start' | 'stop' | 'destroy' | 'create'
    }) => {
      return window.spriteAPI.lifecycle(sprite, org, action)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sprites'] })
    },
  })
}
