import { join } from 'node:path'
import type { BrowserWindow } from 'electron'

export type PageName = 'index' | 'alarm'

/**
 * 창에 화면(html)을 띄운다.
 * 개발 모드(npm run dev)에서는 Vite 개발 서버 주소를, 빌드된 앱에서는 파일을 연다.
 */
export function loadPage(win: BrowserWindow, page: PageName): void {
  const devUrl = process.env['ELECTRON_RENDERER_URL']
  if (devUrl) {
    void win.loadURL(`${devUrl}/${page}.html`)
  } else {
    void win.loadFile(join(__dirname, `../renderer/${page}.html`))
  }
}

export const PRELOAD_PATH = join(__dirname, '../preload/index.js')
