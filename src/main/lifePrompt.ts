// 데스크톱 생활 기록 확인 창: core/promptEngine이 정한 질문(기상·식사)을 항상 위 작은 창으로 띄운다.
// 스케줄러가 30초마다(그리고 앱 시작·절전 복귀·잠금 해제 때) check()를 부른다.
import { BrowserWindow, ipcMain, powerMonitor, screen } from 'electron'
import { createPromptEngine, type PromptRequest } from '../core/promptEngine'
import type { SqlDatabase } from '../core/db/sql'
import type { PromptAnswer, PromptInfo } from '../shared/types'
import { loadPage, PRELOAD_PATH } from './loadPage'
import { createPillIcon } from './trayIcon'

const WIDTH = 380
const HEIGHT = 320
/** 이 시간(초) 안에 키보드·마우스를 썼으면 'PC를 쓰는 중' */
const ACTIVE_IDLE_SECONDS = 60

export interface LifePrompter {
  check: () => void
}

/** @param onRecorded 기록·거름이 바뀌었을 때 (알람·오늘 탭·트레이 갱신) */
export function createLifePrompter(db: SqlDatabase, onRecorded: () => void): LifePrompter {
  const engine = createPromptEngine(db)
  let win: BrowserWindow | null = null
  let current: PromptRequest | null = null

  ipcMain.handle('prompt:info', (): PromptInfo | null => (current ? engine.info(current) : null))

  ipcMain.on('prompt:respond', (_event, answer: PromptAnswer) => {
    const asked = current
    win?.close()
    if (asked && engine.answer(asked, answer)) onRecorded()
  })

  const open = (next: PromptRequest) => {
    current = next
    const { x, y, width, height } = screen.getDisplayNearestPoint(screen.getCursorScreenPoint()).workArea
    win = new BrowserWindow({
      width: WIDTH,
      height: HEIGHT,
      x: Math.round(x + (width - WIDTH) / 2),
      y: Math.round(y + (height - HEIGHT) / 3),
      frame: false,
      resizable: false,
      minimizable: false,
      maximizable: false,
      alwaysOnTop: true,
      show: false,
      icon: createPillIcon(),
      title: '생활 기록',
      webPreferences: {
        preload: PRELOAD_PATH,
        sandbox: true,
        contextIsolation: true,
        autoplayPolicy: 'no-user-gesture-required'
      }
    })
    win.once('ready-to-show', () => {
      win?.show()
      win?.flashFrame(true)
    })
    win.on('closed', () => {
      win = null
      current = null
    })
    loadPage(win, 'prompt')
  }

  return {
    check: () => {
      if (win && !win.isDestroyed()) return
      const next = engine.next(new Date(), powerMonitor.getSystemIdleTime() <= ACTIVE_IDLE_SECONDS)
      if (next) open(next)
    }
  }
}
