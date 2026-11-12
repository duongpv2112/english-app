import { createRouter, type RouterHistory } from 'vue-router'
import { useAuthStore } from './stores/auth.ts'

declare module 'vue-router' {
  interface RouteMeta {
    requiresAuth?: boolean
  }
}

export function createAppRouter(history: RouterHistory) {
  const router = createRouter({
    history,
    routes: [
      { path: '/login', component: () => import('./views/LoginView.vue') },
      { path: '/', component: () => import('./views/HomeView.vue'), meta: { requiresAuth: true } },
      {
        path: '/study',
        component: () => import('./views/StudyView.vue'),
        meta: { requiresAuth: true },
      },
    ],
  })

  router.beforeEach(async (to) => {
    const auth = useAuthStore()
    if (!auth.checked) await auth.fetchMe()
    if (to.meta.requiresAuth && !auth.user) {
      return { path: '/login', query: { redirect: to.fullPath } }
    }
    if (to.path === '/login' && auth.user) return '/'
  })

  return router
}
