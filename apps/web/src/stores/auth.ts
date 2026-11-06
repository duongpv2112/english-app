import type { LoginRequest, MeResponse } from '@english-app/shared'
import { defineStore } from 'pinia'
import { api, ApiError } from '../api/client.ts'

export const useAuthStore = defineStore('auth', {
  state: () => ({
    user: null as MeResponse | null,
    // Whether the session has been checked against the server at least once.
    checked: false,
  }),
  actions: {
    async fetchMe() {
      try {
        this.user = await api<MeResponse>('/auth/me')
      } catch (e) {
        if (!(e instanceof ApiError)) throw e
        this.user = null
      } finally {
        this.checked = true
      }
    },
    async login(req: LoginRequest) {
      this.user = await api<MeResponse>('/auth/login', { method: 'POST', body: req })
      this.checked = true
    },
    async logout() {
      await api<void>('/auth/logout', { method: 'POST' })
      this.user = null
    },
  },
})
