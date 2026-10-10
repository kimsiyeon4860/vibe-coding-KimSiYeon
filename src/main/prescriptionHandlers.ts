// 화면에서 오는 처방약 요청(IPC)을 받아 DB 함수로 연결한다
import { ipcMain } from 'electron'
import type { DatabaseSync } from 'node:sqlite'
import { parsePrescriptionDraft } from '../shared/prescription'
import type { PrescriptionSaveResult } from '../shared/types'
import {
  createPrescription,
  deletePrescription,
  listPrescriptions,
  setPrescriptionActive,
  updatePrescription
} from './db/prescriptions'

/** @param onChanged 처방약이 바뀌면 호출 (알람 다시 확인용) */
export function registerPrescriptionHandlers(db: DatabaseSync, onChanged: () => void): void {
  ipcMain.handle('prescriptions:list', () => listPrescriptions(db))

  ipcMain.handle('prescriptions:create', (_event, draft: unknown): PrescriptionSaveResult => {
    const parsed = parsePrescriptionDraft(draft)
    if (!parsed.ok) return parsed
    const prescription = createPrescription(db, parsed.value)
    onChanged()
    return { ok: true, prescription }
  })

  ipcMain.handle('prescriptions:update', (_event, id: unknown, draft: unknown): PrescriptionSaveResult => {
    const parsed = parsePrescriptionDraft(draft)
    if (!parsed.ok) return parsed
    const prescription = isId(id) ? updatePrescription(db, id, parsed.value) : null
    if (!prescription) return { ok: false, errors: ['수정할 처방약을 찾을 수 없습니다'] }
    onChanged()
    return { ok: true, prescription }
  })

  ipcMain.handle('prescriptions:set-active', (_event, id: unknown, active: unknown) => {
    if (isId(id) && typeof active === 'boolean') setPrescriptionActive(db, id, active)
    onChanged()
  })

  ipcMain.handle('prescriptions:delete', (_event, id: unknown) => {
    if (isId(id)) deletePrescription(db, id)
    onChanged()
  })
}

function isId(value: unknown): value is number {
  return Number.isInteger(value) && (value as number) > 0
}
