import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { fileURLToPath, URL } from 'node:url'

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:8787',
        changeOrigin: true,
        secure: false,
        // 确保代理不会缓冲 SSE（Server-Sent Events）数据流
        /* configure: (proxy, options) => {
          proxy.on('proxyRes', (proxyRes, req, res) => {
            // 强行干掉代理可能会加上的 content-length，让浏览器知道这是一个持续的流
            delete proxyRes.headers['content-length'];
            proxyRes.headers['cache-control'] = 'no-cache';
            proxyRes.headers['x-accel-buffering'] = 'no';
          });
        } */
      },
    },
  },
})
