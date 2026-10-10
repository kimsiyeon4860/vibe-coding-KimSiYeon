// 웹판 저장소(sql.js)에서도 데스크톱과 같은 DB 코드가 그대로 동작하는지
import initSqlJs, { type Database, type SqlJsStatic } from 'sql.js'
import { beforeAll, describe, expect, it } from 'vitest'
import { initDatabase } from '../src/core/db/init'
import { MIGRATIONS } from '../src/core/db/migrations'
import { createPrescription } from '../src/core/db/prescriptions'
import { getSettings, saveSettings } from '../src/core/db/settings'
import type { SqlDatabase } from '../src/core/db/sql'
import { createSupplement, deleteSupplement, getSupplement, listSupplements, updateSupplement } from '../src/core/db/supplements'
import { getDayPlan, getStatsView, getTodayView, recordCheck, recordLifeEvent, skipMeal } from '../src/core/today'
import { DEFAULT_SETTINGS } from '../src/shared/schedule'
import type { SupplementInput } from '../src/shared/types'
import { exportDatabase, wrapSqlJs } from '../src/web/sqljsDatabase'

let SQL: SqlJsStatic
beforeAll(async () => {
  SQL = await initSqlJs()
})

const open = (bytes?: Uint8Array): { raw: Database; db: SqlDatabase } => {
  const raw = new SQL.Database(bytes)
  return { raw, db: initDatabase(wrapSqlJs(raw)) }
}

const DATE = '2026-10-10'
const at = (hm: string) => new Date(`${DATE}T${hm}:00+09:00`)
const REGISTERED = new Date('2026-10-01T00:00:00Z')

const vitaminD: SupplementInput = {
  name: '비타민D',
  manufacturer: '종근당',
  labelInstruction: '',
  ingredients: [{ name: '비타민 D3', amount: 25, unit: 'μg' }],
  schedule: [{ slot: 'breakfast', customTime: null, dose: '1정' }]
}

describe('sql.js 어댑터', () => {
  it('마이그레이션 최신까지', () => {
    const { db } = open()
    const { user_version } = db.prepare('PRAGMA user_version').get() as { user_version: number }
    expect(user_version).toBe(MIGRATIONS.length)
  })

  it('영양제 저장·조회·수정, 자동 증가 id', () => {
    const { db } = open()
    const a = createSupplement(db, vitaminD, 'manual', REGISTERED)
    const b = createSupplement(db, { ...vitaminD, name: '마그네슘' }, 'manual', REGISTERED)
    expect(b.id).toBe(a.id + 1)
    expect(getSupplement(db, a.id)).toMatchObject({ ...vitaminD, active: true })
    updateSupplement(db, a.id, { ...vitaminD, name: '비타민D3' })
    expect(listSupplements(db).map((s) => s.name)).toEqual(['마그네슘', '비타민D3'])
  })

  it('외래키: 삭제하면 성분·일정·기록이 함께 지워진다', () => {
    const { db } = open()
    const { id } = createSupplement(db, vitaminD, 'manual', REGISTERED)
    recordCheck(db, DATE, id, 'breakfast', 'taken', at('08:20'))
    deleteSupplement(db, id)
    for (const table of ['ingredients', 'schedule_items', 'intake_logs']) {
      expect((db.prepare(`SELECT COUNT(*) AS c FROM ${table}`).get() as { c: number }).c, table).toBe(0)
    }
  })

  it('트랜잭션: 중간에 실패하면 모두 취소', () => {
    const { db } = open()
    const broken = { ...vitaminD, ingredients: [{ name: null, amount: 1, unit: '' }] } as unknown as SupplementInput
    expect(() => createSupplement(db, broken)).toThrow()
    expect(listSupplements(db)).toEqual([])
  })

  it('오늘 계획·생활 기록·식사 거름·통계·설정', () => {
    const { db } = open()
    createSupplement(db, vitaminD, 'manual', REGISTERED)
    createPrescription(
      db,
      {
        name: '감기약',
        mealTiming: 'after',
        mealOffsetMinutes: 30,
        startDate: DATE,
        days: 3,
        memo: '',
        schedule: [{ slot: 'lunch', customTime: null, dose: '' }]
      },
      REGISTERED
    )
    recordLifeEvent(db, DATE, 'breakfast', '09:00')
    skipMeal(db, DATE, 'lunch', at('13:30'))
    const view = getTodayView(db, at('14:00'))
    expect(view.planDate).toBe(DATE)
    expect(view.entries.map((e) => [e.productName, e.time, e.mealSkip])).toEqual([
      ['비타민D', '09:15', null],
      ['감기약', '13:30', 'prescription']
    ])
    expect(getStatsView(db, 7, at('14:00')).days).toHaveLength(7)

    saveSettings(db, { ...DEFAULT_SETTINGS, wakeTime: '06:30' })
    expect(getSettings(db).wakeTime).toBe('06:30')
  })

  it('내보낸 바이트로 다시 열면 그대로, 내보낸 뒤에도 외래키가 켜져 있다', () => {
    const first = open()
    const { id } = createSupplement(first.db, vitaminD, 'manual', REGISTERED)
    const bytes = exportDatabase(first.raw)

    const fk = first.db.prepare('PRAGMA foreign_keys').get() as { foreign_keys: number }
    expect(fk.foreign_keys).toBe(1)

    const second = open(bytes)
    expect(getDayPlan(second.db, DATE)[0]).toMatchObject({ productId: id, productName: '비타민D' })
  })
})
