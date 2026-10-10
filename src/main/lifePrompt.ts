// 생활 기록 확인 창 (한 번에 하나):
// - 기상: 그날 처음 PC를 쓸 때 "오늘 일어난 시간을 기록할까요?"
// - 식사: 클릭 기록 모드에서 평소 식사 시간 + 대기 시간이 지나도 기록이 없으면 "○○ 드셨어요?"
// 스케줄러가 30초마다(그리고 앱 시작·절전 복귀·잠금 해제 때) check()를 부른다.
import { BrowserWindow, ipcMain, powerMonitor, screen } from 'electron'
import type { DatabaseSync } from 'node:sqlite'
import { pendingMealQuestions } from '../shared/alarm'
import { clockOf, isWakePromptTime, parseHm, planDateFor } from '../shared/schedule'
import { MEAL_EVENTS, type LifeEvent, type MealEvent, type PromptAnswer, type PromptInfo } from '../shared/types'
import { listDayEvents, listDaySkips } from './db/lifeEvents'
import { getSettings } from './db/settings'
import { loadPage, PRELOAD_PATH } from './loadPage'
import { getDayPlan, recordLifeEvent, skipMeal } from './today'
import { createPillIcon } from './trayIcon'

const WIDTH = 380
const HEIGHT = 320
/** 이 시간(초) 안에 키보드·마우스를 썼으면 'PC를 쓰는 중' */
const ACTIVE_IDLE_SECONDS = 60
/** 식사 확인에서 '나중에'를 누르면 다시 묻기까지 */
const MEAL_LATER_MS = 30 * 60_000

export interface LifePrompter {
  check: () => void
}

/** @param onRecorded 기록·거름이 바뀌었을 때 (알람·오늘 탭·트레이 갱신) */
export function createLifePrompter(db: DatabaseSync, onRecorded: () => void): LifePrompter {
  let win: BrowserWindow | null = null
  let current: { kind: 'wake' | 'meal'; event: LifeEvent; planDate: string } | null = null
  /** 기상을 이미 물어본 복용일 (나중에를 눌렀어도 그날은 다시 묻지 않는다) */
  let wakeAskedFor: string | null = null
  /** 식사 확인 '나중에': "복용일|식사" → 다시 물을 시각(ms) */
  const mealLater = new Map<string, number>()

  ipcMain.handle('prompt:info', (): PromptInfo | null =>
    current
      ? {
          ...current,
          now: clockOf(new Date().toISOString()),
          sound: current.kind === 'meal' && getSettings(db).alarmSound
        }
      : null
  )

  ipcMain.on('prompt:respond', (_event, answer: PromptAnswer) => {
    const asked = current
    win?.close()
    if (!asked) return
    const { planDate, event } = asked
    if (answer?.action === 'now') recordLifeEvent(db, planDate, event)
    else if (answer?.action === 'at' && parseHm(answer.time) !== null) recordLifeEvent(db, planDate, event, answer.time)
    else if (answer?.action === 'skip' && MEAL_EVENTS.includes(event as MealEvent)) skipMeal(db, planDate, event as MealEvent)
    else {
      if (asked.kind === 'meal') mealLater.set(`${planDate}|${event}`, Date.now() + MEAL_LATER_MS)
      return
    }
    onRecorded()
  })

  const open = (next: NonNullable<typeof current>) => {
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
      const settings = getSettings(db)
      const now = new Date()
      const planDate = planDateFor(now, settings)
      const events = listDayEvents(db, planDate)

      // 1) 식사 확인: 알람 대신 묻는 것이라 PC를 쓰는 중이 아니어도 띄운다
      const skips = listDaySkips(db, planDate)
      const meals = pendingMealQuestions(getDayPlan(db, planDate), events, skips, settings, now).filter(
        (meal) => (mealLater.get(`${planDate}|${meal}`) ?? 0) <= now.getTime()
      )
      if (meals.length > 0) {
        open({ kind: 'meal', event: meals[0], planDate })
        return
      }

      // 2) 기상: 그날 처음 PC를 쓰는 중일 때 한 번
      if (settings.eventModes.wake !== 'click' || wakeAskedFor === planDate || events.wake) return
      if (!isWakePromptTime(now, settings)) return
      if (powerMonitor.getSystemIdleTime() > ACTIVE_IDLE_SECONDS) return
      wakeAskedFor = planDate
      open({ kind: 'wake', event: 'wake', planDate })
    }
  }
}
