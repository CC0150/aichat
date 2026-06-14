import { createApp } from 'vue'
import VueVirtualScroller from 'vue3-virtual-scroller'
import 'vue3-virtual-scroller/dist/vue3-virtual-scroller.css'
import FloatingVue from 'floating-vue'
import 'floating-vue/dist/style.css'
import { createPinia } from 'pinia'
import piniaPluginPersistedstate from 'pinia-plugin-persistedstate'
import App from './App.vue'
import router from './router'
import './assets/theme.css'

const pinia = createPinia()
pinia.use(piniaPluginPersistedstate)

// 首屏根据持久化的 app 状态设置 html class，避免主题闪烁
try {
  const raw = localStorage.getItem('app')
  if (raw) {
    const app = JSON.parse(raw)
    if (app.isDark === false) document.documentElement.classList.remove('dark')
    else document.documentElement.classList.add('dark')
  } else {
    document.documentElement.classList.add('dark')
  }
} catch (_) {
  document.documentElement.classList.add('dark')
}

const app = createApp(App)
app.use(pinia)
app.use(router)
app.use(FloatingVue, {
  themes: {
    tooltip: {
      delay: { show: 200, hide: 0 },
      distance: 8,
    },
  },
  distance: 8,
})
app.use(VueVirtualScroller)
app.mount('#app')
