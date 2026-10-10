// 화면에서 오는 영양제 요청(IPC)을 받아 DB 함수로 연결한다
import { ipcMain } from 'electron'
import type { DatabaseSync } from 'node:sqlite'
import { parseSupplementDraft } from '../shared/supplementInput'
import { SLOTS, type SaveResult, type ScheduleChange, type Slot } from '../shared/types'
import {
  applyScheduleChanges,
  createSupplement,
  deleteSupplement,
  listSupplements,
  setSupplementActive,
  updateSupplement
} from './db/supplements'

/** @param onChanged 영양제가 바뀌면 호출 (알람 다시 확인용) */
export function registerSupplementHandlers(db: DatabaseSync, onChanged: () => void): void {
  ipcMain.handle('supplements:list', () => listSupplements(db))

  ipcMain.handle('supplements:create', (_event, draft: unknown): SaveResult => {
    const parsed = parseSupplementDraft(draft)
    if (!parsed.ok) return parsed
    const supplement = createSupplement(db, parsed.value)
    onChanged()
    return { ok: true, supplement }
  })

  ipcMain.handle('supplements:update', (_event, id: unknown, draft: unknown): SaveResult => {
    const parsed = parseSupplementDraft(draft)
    if (!parsed.ok) return parsed
    const supplement = isId(id) ? updateSupplement(db, id, parsed.value) : null
    if (!supplement) return { ok: false, errors: ['수정할 영양제를 찾을 수 없습니다'] }
    onChanged()
    return { ok: true, supplement }
  })

  ipcMain.handle('supplements:set-active', (_event, id: unknown, active: unknown) => {
    if (isId(id) && typeof active === 'boolean') setSupplementActive(db, id, active)
    onChanged()
  })

  ipcMain.handle('supplements:delete', (_event, id: unknown) => {
    if (isId(id)) deleteSupplement(db, id)
    onChanged()
  })

  ipcMain.handle('supplements:apply-schedule', (_event, changes: unknown) => {
    if (!Array.isArray(changes) || !changes.every(isScheduleChange)) return
    applyScheduleChanges(db, changes)
    onChanged()
  })
}

function isScheduleChange(value: unknown): value is ScheduleChange {
  if (typeof value !== 'object' || value === null) return false
  const { id, slots } = value as Record<string, unknown>
  return (
    isId(id) &&
    Array.isArray(slots) &&
    slots.every((s) => SLOTS.includes(s as Slot)) &&
    new Set(slots).size === slots.length
  )
}

function isId(value: unknown): value is number {
  return Number.isInteger(value) && (value as number) > 0
}
