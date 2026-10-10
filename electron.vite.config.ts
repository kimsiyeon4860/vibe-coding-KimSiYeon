import { resolve } from 'node:path'
import { defineConfig } from 'electron-vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  main: {},
  preload: {},
  renderer: {
    plugins: [react(), tailwindcss()],
    build: {
      rollupOptions: {
        // 화면이 두 개: 메인 창(index)과 알람 팝업(alarm)
        input: {
          index: resolve(__dirname, 'src/renderer/index.html'),
          alarm: resolve(__dirname, 'src/renderer/alarm.html'),
          wake: resolve(__dirname, 'src/renderer/wake.html')
        }
      }
    }
  }
})
