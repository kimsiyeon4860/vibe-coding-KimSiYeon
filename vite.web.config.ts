// 웹판(정적 웹 앱) 빌드 — npm run build:web → dist-web/ (GitHub Pages에 그대로 올린다)
import { resolve } from 'node:path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  root: resolve(__dirname, 'web'),
  // GitHub Pages는 /저장소이름/ 아래에 올라가므로 상대 경로로 만든다
  base: './',
  plugins: [react(), tailwindcss()],
  server: { fs: { allow: [resolve(__dirname)] } },
  build: {
    outDir: resolve(__dirname, 'dist-web'),
    emptyOutDir: true
  }
})
