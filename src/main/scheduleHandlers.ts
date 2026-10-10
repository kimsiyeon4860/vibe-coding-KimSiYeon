// 화면에서 오는 설정·오늘 복용 요청(IPC)을 처리한다
import { ipcMain } from 'electron'
import type { DatabaseSync } from 'node:sqlite'
import { isPlanDate, parseSettings } from '../shared/schedule'
import { SLOTS, type CheckAction, type ParseResult, type Settings, type Slot } from '../shared/types'
import { getSettings, saveSettings } from './db/settings'
import { getTodayView, recordCheck, undoCheck } from './today'

export function registerScheduleHandlers(db: DatabaseSync): void {
  ipcMain.handle('settings:get', () => getSettings(db))

  ipcMain.handle('settings:save', (_event, raw: unknown): ParseResult<Settings> => {
    const parsed = parseSettings(raw)
    if (parsed.ok) saveSettings(db, parsed.value)
    return parsed
  })

  ipcMain.handle('today:get', () => getTodayView(db))

  ipcMain.handle('today:check', (_event, planDate: unknown, productId: unknown, slot: unknown, action: unknown) => {
    if (isPlanDate(planDate) && isId(productId) && isSlot(slot) && isCheckAction(action)) {
      recordCheck(db, planDate, productId, slot, action)
    }
    return getTodayView(db)
  })

  ipcMain.handle('today:undo', (_event, planDate: unknown, productId: unknown, slot: unknown) => {
    if (isPlanDate(planDate) && isId(productId) && isSlot(slot)) undoCheck(db, planDate, productId, slot)
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
