import type { DatabaseSync } from 'node:sqlite'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { openDatabase } from '../src/main/db/connection'
import {
  createPrescription,
  deletePrescription,
  getPrescription,
  listPrescriptions,
  setPrescriptionActive,
  updatePrescription
} from '../src/main/db/prescriptions'
import { createSupplement, listSupplements, updateSupplement } from '../src/main/db/supplements'
import { getDayPlan, getTodayView, recordCheck } from '../src/main/today'
import type { PrescriptionInput, SupplementInput } from '../src/shared/types'

const coldMedicine: PrescriptionInput = {
  name: '감기약',
  mealTiming: 'after',
  mealOffsetMinutes: 30,
  startDate: '2026-10-10',
  days: 3,
  memo: 'OO내과',
  schedule: [
    { slot: 'breakfast', customTime: null, dose: '1포' },
    { slot: 'dinner', customTime: null, dose: '1포' }
  ]
}

const vitaminD: SupplementInput = {
  name: '비타민D',
  manufacturer: '',
  labelInstruction: '',
  ingredients: [],
  schedule: [{ slot: 'breakfast', customTime: null, dose: '' }]
}

/** 2026-10-10 07:00 KST — 아침 알람 전에 등록 */
const MORNING = new Date('2026-10-09T22:00:00Z')

let db: DatabaseSync

beforeEach(() => {
  db = openDatabase(':memory:')
})

afterEach(() => {
  db.close()
})

describe('처방약 저장', () => {
  it('저장하고 다시 읽는다', () => {
    const saved = createPrescription(db, coldMedicine, MORNING)
    expect(saved).toMatchObject({ ...coldMedicine, active: true, createdAt: MORNING.toISOString() })
    expect(getPrescription(db, saved.id)).toEqual(saved)
  })

  it('영양제 목록과 섞이지 않는다', () => {
    createPrescription(db, coldMedicine)
    createSupplement(db, vitaminD)
    expect(listPrescriptions(db).map((p) => p.name)).toEqual(['감기약'])
    expect(listSupplements(db).map((s) => s.name)).toEqual(['비타민D'])
  })

  it('수정', () => {
    const saved = createPrescription(db, coldMedicine)
    const updated = updatePrescription(db, saved.id, { ...coldMedicine, days: null, mealTiming: 'before' })
    expect(updated).toMatchObject({ days: null, mealTiming: 'before' })
    expect(updatePrescription(db, 999, coldMedicine)).toBeNull()
  })

  it('복용 종료하면 오늘 목록에서 빠진다', () => {
    const saved = createPrescription(db, coldMedicine, MORNING)
    setPrescriptionActive(db, saved.id, false)
    expect(getDayPlan(db, '2026-10-10')).toEqual([])
  })

  it('삭제하면 처방 정보·먹는 때·기록이 함께 지워진다', () => {
    const saved = createPrescription(db, coldMedicine, MORNING)
    recordCheck(db, '2026-10-10', saved.id, 'breakfast', 'taken', MORNING)
    deletePrescription(db, saved.id)
    for (const table of ['prescriptions', 'schedule_items', 'intake_logs']) {
      const { count } = db.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get() as { count: number }
      expect(count, table).toBe(0)
    }
  })
})

describe('오늘 목록', () => {
  it('처방약이 식후 30분 시간으로, 처방 기간 동안만 나온다', () => {
    createPrescription(db, coldMedicine, MORNING)
    expect(getDayPlan(db, '2026-10-10').map((e) => [e.time, e.kind, e.dose])).toEqual([
      ['08:30', 'prescription', '1포'],
      ['19:00', 'prescription', '1포']
    ])
    expect(getDayPlan(db, '2026-10-12')).toHaveLength(2)
    expect(getDayPlan(db, '2026-10-13')).toHaveLength(0)
  })

  it('처방약과 영양제를 함께 먹는 날이면 안내 표시', () => {
    createSupplement(db, vitaminD, 'manual', MORNING)
    expect(getTodayView(db, MORNING).mixesPrescriptionAndSupplement).toBe(false)
    createPrescription(db, coldMedicine, MORNING)
    expect(getTodayView(db, MORNING).mixesPrescriptionAndSupplement).toBe(true)
  })
})

describe('복용 시점 등록 시각', () => {
  it('새로 추가한 시점만 등록 시각이 바뀌고, 원래 있던 시점은 유지된다', () => {
    const created = new Date('2026-10-10T00:00:00Z')
    const later = new Date('2026-10-10T05:00:00Z')
    const { id } = createSupplement(db, vitaminD, 'manual', created)
    updateSupplement(
      db,
      id,
      { ...vitaminD, name: '비타민D3', schedule: [...vitaminD.schedule, { slot: 'dinner', customTime: null, dose: '' }] },
      later
    )
    const rows = db.prepare('SELECT slot, created_at FROM schedule_items ORDER BY slot').all()
    expect(rows.map((r) => ({ ...r }))).toEqual([
      { slot: 'breakfast', created_at: created.toISOString() },
      { slot: 'dinner', created_at: later.toISOString() }
    ])
  })
})
