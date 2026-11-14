import type { StatsOverview } from '@english-app/shared'
import { defineStore } from 'pinia'
import { api } from '../api/client.ts'

export const useStatsStore = defineStore('stats', {
  state: () => ({
    overview: null as StatsOverview | null,
    status: 'idle' as 'idle' | 'loading' | 'ready' | 'error',
  }),
  actions: {
    /** Fetches the overview. On failure the last one stays on screen. */
    async load() {
      this.status = 'loading'
      try {
        this.overview = await api<StatsOverview>('/stats/overview')
        this.status = 'ready'
      } catch {
        this.status = 'error'
      }
    },
  },
})
