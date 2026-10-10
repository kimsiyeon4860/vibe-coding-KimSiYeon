// 화면에서 오는 설정·오늘 복용 요청(IPC)을 처리한다
import { ipcMain } from 'electron'
import type { DatabaseSync } from 'node:sqlite'
import { isPlanDate, parseHm, parseSettings } from '../shared/schedule'
import {
  LIFE_EVENTS,
  MEAL_EVENTS,
  SLOTS,
  type MealEvent,
  type CheckAction,
  type LifeEvent,
  type ParseResult,
  type Settings,
  type Slot
} from '../shared/types'
import { applyAutoLaunch } from './autoLaunch'
import { getSettings, saveSettings } from './db/settings'
import {
  clearLifeEvent,
  getStatsView,
  getTodayView,
  recordCheck,
  recordLifeEvent,
  skipMeal,
  undoCheck
} from './today'

/** @param onChanged 설정·기록이 바뀌면 호출 (알람 다시 확인용) */
export function registerScheduleHandlers(db: DatabaseSync, onChanged: () => void): void {
  ipcMain.handle('settings:get', () => getSettings(db))

  ipcMain.handle('settings:save', (_event, raw: unknown): ParseResult<Settings> => {
    const parsed = parseSettings(raw)
    if (parsed.ok) {
      saveSettings(db, parsed.value)
      applyAutoLaunch(parsed.value.autoLaunch)
      onChanged()
    }
    return parsed
  })

  ipcMain.handle('today:get', () => getTodayView(db))

  ipcMain.handle('stats:get', (_event, days: unknown) => getStatsView(db, days === 30 ? 30 : 7))

  ipcMain.handle('today:check', (_event, planDate: unknown, productId: unknown, slot: unknown, action: unknown) => {
    if (isPlanDate(planDate) && isId(productId) && isSlot(slot) && isCheckAction(action)) {
      recordCheck(db, planDate, productId, slot, action)
      onChanged()
    }
    return getTodayView(db)
  })

  ipcMain.handle('today:record-event', (_event, planDate: unknown, lifeEvent: unknown, time: unknown) => {
    const validTime = time === undefined || time === null || parseHm(time) !== null
    if (isPlanDate(planDate) && isLifeEvent(lifeEvent) && validTime) {
      recordLifeEvent(db, planDate, lifeEvent, typeof time === 'string' ? time : undefined)
      onChanged()
    }
    return getTodayView(db)
  })

  ipcMain.handle('today:clear-event', (_event, planDate: unknown, lifeEvent: unknown) => {
    if (isPlanDate(planDate) && isLifeEvent(lifeEvent)) {
      clearLifeEvent(db, planDate, lifeEvent)
      onChanged()
    }
    return getTodayView(db)
  })

  ipcMain.handle('today:skip-event', (_event, planDate: unknown, meal: unknown) => {
    if (isPlanDate(planDate) && MEAL_EVENTS.includes(meal as MealEvent)) {
      skipMeal(db, planDate, meal as MealEvent)
      onChanged()
    }
    return getTodayView(db)
  })

  ipcMain.handle('today:undo', (_event, planDate: unknown, productId: unknown, slot: unknown) => {
    if (isPlanDate(planDate) && isId(productId) && isSlot(slot)) {
      undoCheck(db, planDate, productId, slot)
      onChanged()
    }
    return getTodayView(db)
  })
}

function isId(value: unknown): value is number {
  return Number.isInteger(value) && (value as number) > 0
}

function isSlot(value: unknown): value is Slot {
  return SLOTS.includes(value as Slot)
}

function isCheckAction(value: unknown): value is CheckAction {
  return value === 'taken' || value === 'skipped'
}

function isLifeEvent(value: unknown): value is LifeEvent {
  return LIFE_EVENTS.includes(value as LifeEvent)
}
