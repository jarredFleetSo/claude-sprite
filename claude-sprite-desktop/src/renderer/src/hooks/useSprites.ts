import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import type { SpriteInfo } from '../lib/sprite-types'

export function useSprites() {
  return useQuery({
    queryKey: ['sprites'],
    queryFn: async (): Promise<SpriteInfo[]> => {
      // Fetch via main process IPC to avoid CORS issues
      return window.spriteAPI.listSprites()
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
