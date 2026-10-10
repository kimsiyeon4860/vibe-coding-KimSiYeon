import type { DatabaseSync } from 'node:sqlite'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { openDatabase } from '../src/main/db/connection'
import { getSettings, saveSettings } from '../src/main/db/settings'
import { createSupplement, deleteSupplement, setSupplementActive, updateSupplement } from '../src/main/db/supplements'
import { getDayPlan, getTodayView, recordCheck, undoCheck } from '../src/main/today'
import { DEFAULT_SETTINGS } from '../src/shared/schedule'
import type { SupplementInput } from '../src/shared/types'

const vitaminD: SupplementInput = {
  name: '비타민D',
  manufacturer: '',
  labelInstruction: '',
  ingredients: [],
  schedule: [{ slot: 'breakfast', customTime: null, dose: '1정' }]
}

const DATE = '2026-10-10'
/** 2026-10-10 09:00 KST */
const NOW = new Date('2026-10-10T00:00:00Z')

let db: DatabaseSync

beforeEach(() => {
  db = openDatabase(':memory:')
})

afterEach(() => {
  db.close()
})

describe('설정', () => {
  it('저장한 적 없으면 기본값', () => {
    expect(getSettings(db)).toEqual(DEFAULT_SETTINGS)
  })

  it('저장하면 다시 읽힌다', () => {
    const changed = { ...DEFAULT_SETTINGS, wakeTime: '06:30', slotOverrides: { lunch: '13:00' } }
    saveSettings(db, changed)
    expect(getSettings(db)).toEqual(changed)
  })

  it('저장된 값이 깨져 있으면 기본값으로 버틴다', () => {
    db.prepare(`INSERT INTO settings (key, value) VALUES ('wakeTime', '"아침"')`).run()
    expect(getSettings(db)).toEqual(DEFAULT_SETTINGS)
  })

  it('설정을 바꾸면 오늘 계획 시간도 바뀐다', () => {
    createSupplement(db, vitaminD)
    saveSettings(db, { ...DEFAULT_SETTINGS, breakfastTime: '09:00' })
    expect(getDayPlan(db, DATE)[0].time).toBe('09:15')
  })
})

describe('오늘 복용', () => {
  it('지금 시각의 복용일과 계획을 돌려준다', () => {
    createSupplement(db, vitaminD)
    const view = getTodayView(db, NOW)
    expect(view.planDate).toBe(DATE)
    expect(view.entries).toMatchObject([{ productName: '비타민D', time: '08:15', dose: '1정', status: 'pending' }])
  })

  it('먹음 기록 → 되돌리기', () => {
    const { id } = createSupplement(db, vitaminD)
    expect(recordCheck(db, DATE, id, 'breakfast', 'taken', NOW)).toBe(true)
    expect(getDayPlan(db, DATE)[0]).toMatchObject({ status: 'taken', actedAt: NOW.toISOString() })

    undoCheck(db, DATE, id, 'breakfast')
    expect(getDayPlan(db, DATE)[0]).toMatchObject({ status: 'pending', actedAt: null })
  })

  it('기록에는 예정 일시도 함께 남는다', () => {
    saveSettings(db, { ...DEFAULT_SETTINGS, eventModes: { wake: 'fixed' as const, breakfast: 'fixed' as const, lunch: 'fixed' as const, dinner: 'fixed' as const, bed: 'fixed' as const } })
    const { id } = createSupplement(db, vitaminD)
    recordCheck(db, DATE, id, 'breakfast', 'skipped', NOW)
    const row = db.prepare('SELECT scheduled_at, action FROM intake_logs').get()
    expect(row).toEqual({ scheduled_at: '2026-10-10T08:15:00.000+09:00', action: 'skipped' })
  })

  it('계획에 없는 항목은 기록하지 않는다', () => {
    const { id } = createSupplement(db, vitaminD)
    expect(recordCheck(db, DATE, id, 'lunch', 'taken', NOW)).toBe(false)
    setSupplementActive(db, id, false)
    expect(recordCheck(db, DATE, id, 'breakfast', 'taken', NOW)).toBe(false)
  })

  it('복용 시점을 바꿔도 과거 기록은 남는다', () => {
    const { id } = createSupplement(db, vitaminD)
    recordCheck(db, DATE, id, 'breakfast', 'taken', NOW)
    updateSupplement(db, id, { ...vitaminD, schedule: [{ slot: 'dinner', customTime: null, dose: '' }] })
    const { count } = db.prepare('SELECT COUNT(*) AS count FROM intake_logs').get() as { count: number }
    expect(count).toBe(1)
  })

  it('영양제를 삭제하면 기록도 함께 지워진다', () => {
    const { id } = createSupplement(db, vitaminD)
    recordCheck(db, DATE, id, 'breakfast', 'taken', NOW)
    deleteSupplement(db, id)
    const { count } = db.prepare('SELECT COUNT(*) AS count FROM intake_logs').get() as { count: number }
    expect(count).toBe(0)
  })
})
