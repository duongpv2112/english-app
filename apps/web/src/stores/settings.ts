import type { Settings, SettingsPatch } from '@english-app/shared'
import { defineStore } from 'pinia'
import { api } from '../api/client.ts'

export const useSettingsStore = defineStore('settings', {
  state: () => ({
    settings: null as Settings | null,
    status: 'idle' as 'idle' | 'loading' | 'ready' | 'error',
  }),
  getters: {
    /** Default audio speed; normal speed until the settings have loaded. */
    playbackRate: (state): number => state.settings?.playbackRate ?? 1,
  },
  actions: {
    /** Loads the settings, unless they are already here and `force` is not set. */
    async load(force = false) {
      if (this.status === 'ready' && !force) return
      this.status = 'loading'
      try {
        this.settings = await api<Settings>('/settings')
        this.status = 'ready'
      } catch {
        this.status = 'error'
      }
    },

    /** Saves a change. Throws the ApiError so the form can say what went wrong. */
    async save(patch: SettingsPatch) {
      this.settings = await api<Settings>('/settings', { method: 'PATCH', body: patch })
      this.status = 'ready'
    },

    reset() {
      this.settings = null
      this.status = 'idle'
    },
  },
})
