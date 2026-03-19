import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import type { AppConfig } from '../lib/sprite-types'

export function useConfig() {
  return useQuery({
    queryKey: ['config'],
    queryFn: () => window.spriteAPI.loadConfig(),
    staleTime: Infinity, // Config doesn't change unless user saves
  })
}

export function useSaveConfig() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (cfg: Partial<AppConfig>) => window.spriteAPI.saveConfig(cfg),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['config'] }),
  })
}
