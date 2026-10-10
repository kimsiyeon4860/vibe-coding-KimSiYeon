// 화면에서 오는 영양제 요청(IPC)을 받아 DB 함수로 연결한다
import { ipcMain } from 'electron'
import type { DatabaseSync } from 'node:sqlite'
import { parseSupplementDraft } from '../shared/supplementInput'
import type { SaveResult } from '../shared/types'
import {
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
}

function isId(value: unknown): value is number {
  return Number.isInteger(value) && (value as number) > 0
}
