// 그날 처음 PC를 쓸 때 기상 기록을 묻는 작은 창.
// 스케줄러가 30초마다(그리고 앱 시작·절전 복귀·잠금 해제 때) check()를 부른다.
import { BrowserWindow, ipcMain, powerMonitor, screen } from 'electron'
import type { DatabaseSync } from 'node:sqlite'
import { clockOf, isWakePromptTime, parseHm, planDateFor } from '../shared/schedule'
import type { Hm } from '../shared/types'
import { listDayEvents } from './db/lifeEvents'
import { getSettings } from './db/settings'
import { loadPage, PRELOAD_PATH } from './loadPage'
import { recordLifeEvent } from './today'
import { createPillIcon } from './trayIcon'

const WIDTH = 380
const HEIGHT = 300
/** 이 시간(초) 안에 키보드·마우스를 썼으면 'PC를 쓰는 중' */
const ACTIVE_IDLE_SECONDS = 60

type WakeAnswer = { action: 'now' } | { action: 'at'; time: Hm } | { action: 'later' }

export interface WakePrompter {
  check: () => void
}

/** @param onRecorded 기상을 기록했을 때 (알람·오늘 탭·트레이 갱신) */
export function createWakePrompter(db: DatabaseSync, onRecorded: () => void): WakePrompter {
  let win: BrowserWindow | null = null
  /** 이미 물어본 복용일 (나중에를 눌렀어도 그날은 다시 묻지 않는다) */
  let promptedFor: string | null = null
  let planDate = ''

  ipcMain.handle('wake:info', () => ({ planDate, now: clockOf(new Date().toISOString()) }))

  ipcMain.on('wake:respond', (_event, answer: WakeAnswer) => {
    if (answer?.action === 'now') recordLifeEvent(db, planDate, 'wake')
    else if (answer?.action === 'at' && parseHm(answer.time) !== null) recordLifeEvent(db, planDate, 'wake', answer.time)
    win?.close()
    if (answer?.action !== 'later') onRecorded()
  })

  const open = () => {
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
      title: '기상 기록',
      webPreferences: { preload: PRELOAD_PATH, sandbox: true, contextIsolation: true }
    })
    win.once('ready-to-show', () => win?.show())
    win.on('closed', () => {
      win = null
    })
    loadPage(win, 'wake')
  }

  return {
    check: () => {
      if (win && !win.isDestroyed()) return
      const settings = getSettings(db)
      if (settings.eventModes.wake !== 'click') return
      const now = new Date()
      const today = planDateFor(now, settings)
      if (promptedFor === today) return
      if (listDayEvents(db, today).wake) return
      if (!isWakePromptTime(now, settings)) return
      if (powerMonitor.getSystemIdleTime() > ACTIVE_IDLE_SECONDS) return
      planDate = today
      promptedFor = today
      open()
    }
  }
}
