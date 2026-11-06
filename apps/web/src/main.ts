import { createPinia } from 'pinia'
import { createApp } from 'vue'
import { createWebHistory } from 'vue-router'
import App from './App.vue'
import { createAppRouter } from './router.ts'
import './style.css'

const app = createApp(App)
app.use(createPinia())
app.use(createAppRouter(createWebHistory()))
app.mount('#app')
