// '전체' 기간 통계의 날 수 (오늘 복용 화면 아래쪽 복용 기록)
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { DatabaseSync } from 'node:sqlite'
import { openDatabase } from '../src/main/db/connection'
import { createSupplement } from '../src/core/db/supplements'
import { allStatsDays, getStatsView, MAX_ALL_STATS_DAYS } from '../src/core/today'

const NOW = new Date('2026-10-10T12:00:00+09:00')

const vitaminD = {
  name: '비타민D',
  manufacturer: '',
  labelInstruction: '',
  ingredients: [],
  schedule: [{ slot: 'breakfast' as const, customTime: null, dose: '' }]
}

describe('allStatsDays', () => {
  let db: DatabaseSync
  beforeEach(() => {
    db = openDatabase(':memory:')
  })
  afterEach(() => db.close())

  it('아무것도 없으면 1일', () => {
    expect(allStatsDays(db, NOW)).toBe(1)
  })

  it('처음 등록한 복용일부터 오늘까지', () => {
    createSupplement(db, vitaminD, 'manual', new Date('2026-10-01T09:00:00+09:00'))
    expect(allStatsDays(db, NOW)).toBe(10)
    expect(getStatsView(db, allStatsDays(db, NOW), NOW).days).toHaveLength(10)
  })

  it('등록보다 이른 기록이 있으면 그날부터', () => {
    createSupplement(db, vitaminD, 'manual', new Date('2026-10-05T09:00:00+09:00'))
    db.prepare(
      `INSERT INTO intake_logs (product_id, slot, plan_date, scheduled_at, action, acted_at)
       VALUES (1, 'breakfast', '2026-10-03', '2026-10-03T08:15:00+09:00', 'taken', '2026-10-03T08:20:00+09:00')`
    ).run()
    expect(allStatsDays(db, NOW)).toBe(8)
  })

  it(`최대 ${MAX_ALL_STATS_DAYS}일`, () => {
    createSupplement(db, vitaminD, 'manual', new Date('2024-01-01T09:00:00+09:00'))
    expect(allStatsDays(db, NOW)).toBe(MAX_ALL_STATS_DAYS)
  })
})
