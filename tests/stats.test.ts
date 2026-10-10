import type { DatabaseSync } from 'node:sqlite'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { openDatabase } from '../src/main/db/connection'
import { createPrescription } from '../src/main/db/prescriptions'
import { createSupplement, updateSupplement } from '../src/main/db/supplements'
import { getStatsView, recordCheck } from '../src/main/today'
import { buildStats, summarizeDay, type StatEntry } from '../src/shared/stats'
import type { DayPlanEntry, SupplementInput } from '../src/shared/types'

const OLD = '1970-01-01T00:00:00.000Z'

const entry = (overrides: Partial<DayPlanEntry> = {}): DayPlanEntry => ({
  productId: 1,
  productName: '비타민D',
  kind: 'supplement',
  slot: 'breakfast',
  dose: '',
  time: '08:15',
  scheduledAt: '2026-10-10T08:15:00.000+09:00',
  status: 'pending',
  actedAt: null,
  snoozedUntil: null,
  waitingFor: null,
  mealSkip: null,
  carriedTo: null,
  mealSkipByHabit: false,
  addedAt: OLD,
  ...overrides
})

const at = (iso: string) => new Date(iso)

describe('summarizeDay', () => {
  it('먹음·건너뜀은 그대로, 시간 지난 대기는 놓침, 아직 안 된 것은 세지 않음', () => {
    const { entries, upcoming } = summarizeDay(
      '2026-10-10',
      [
        entry({ slot: 'wake', status: 'taken' }),
        entry({ slot: 'breakfast', status: 'skipped' }),
        entry({ slot: 'lunch', scheduledAt: '2026-10-10T12:45:00.000+09:00' }),
        entry({ slot: 'dinner', scheduledAt: '2026-10-10T18:45:00.000+09:00' })
      ],
      [],
      at('2026-10-10T15:00:00+09:00')
    )
    expect(entries.map((e) => [e.slot, e.outcome])).toEqual([
      ['wake', 'taken'],
      ['breakfast', 'skipped'],
      ['lunch', 'missed']
    ])
    expect(upcoming).toBe(1)
  })

  it('등록하기 전 시각은 놓침으로 세지 않는다', () => {
    const { entries } = summarizeDay(
      '2026-10-10',
      [entry({ addedAt: '2026-10-10T14:00:00.000+09:00' })],
      [],
      at('2026-10-10T15:00:00+09:00')
    )
    expect(entries).toEqual([])
  })

  it('현재 일정에 없는 시점의 기록도 센다 (중복은 빼고)', () => {
    const { entries } = summarizeDay(
      '2026-10-10',
      [entry({ slot: 'dinner', status: 'taken' })],
      [
        { productId: 1, productName: '비타민D', kind: 'supplement', slot: 'breakfast', action: 'taken' },
        { productId: 1, productName: '비타민D', kind: 'supplement', slot: 'dinner', action: 'taken' }
      ],
      at('2026-10-10T23:00:00+09:00')
    )
    expect(entries.map((e) => e.slot).sort()).toEqual(['breakfast', 'dinner'])
  })
})

describe('buildStats', () => {
  const e = (planDate: string, outcome: StatEntry['outcome'], productId = 1, productName = '비타민D'): StatEntry => ({
    planDate,
    productId,
    productName,
    kind: 'supplement',
    slot: 'breakfast',
    outcome
  })
  const day = (planDate: string, entries: StatEntry[], upcoming = 0) => ({ planDate, entries, upcoming })

  it('복용률과 날짜별·제품별 집계', () => {
    const stats = buildStats([
      day('2026-10-09', [e('2026-10-09', 'taken'), e('2026-10-09', 'missed', 2, '철분')]),
      day('2026-10-10', [e('2026-10-10', 'taken'), e('2026-10-10', 'skipped', 2, '철분')])
    ])
    expect(stats).toMatchObject({ taken: 2, skipped: 1, missed: 1, rate: 0.5 })
    expect(stats.days.map((d) => [d.planDate, d.taken, d.skipped, d.missed])).toEqual([
      ['2026-10-09', 1, 0, 1],
      ['2026-10-10', 1, 1, 0]
    ])
    // 복용률 낮은 순
    expect(stats.products.map((p) => [p.productName, p.rate])).toEqual([
      ['철분', 0],
      ['비타민D', 1]
    ])
  })

  it('셀 것이 없으면 복용률 null', () => {
    expect(buildStats([day('2026-10-10', [])]).rate).toBeNull()
  })

  describe('연속 완료일', () => {
    const done = (d: string) => day(d, [e(d, 'taken')])

    it('오늘까지 모두 먹었으면 오늘 포함', () => {
      expect(buildStats([done('08'), done('09'), done('10')]).streak).toBe(3)
    })

    it('오늘 남은 게 있으면 오늘은 빼고 어제부터', () => {
      expect(buildStats([done('08'), done('09'), day('10', [e('10', 'taken')], 1)]).streak).toBe(2)
    })

    it('하나라도 놓치거나 건너뛰면 끊긴다', () => {
      expect(buildStats([done('07'), day('08', [e('08', 'missed')]), done('09'), done('10')]).streak).toBe(2)
      expect(buildStats([done('09'), day('10', [e('10', 'skipped')])]).streak).toBe(0)
    })

    it('먹을 것이 없던 날은 끊지 않고 건너뛴다', () => {
      expect(buildStats([done('08'), day('09', []), done('10')]).streak).toBe(2)
    })

    it('기간보다 긴 기록으로 셀 수 있다', () => {
      const long = ['05', '06', '07', '08', '09', '10'].map(done)
      expect(buildStats(long.slice(-2), long).streak).toBe(6)
    })
  })
})

describe('DB 통계 (getStatsView)', () => {
  let db: DatabaseSync
  beforeEach(() => {
    db = openDatabase(':memory:')
  })
  afterEach(() => db.close())

  const vitaminD: SupplementInput = {
    name: '비타민D',
    manufacturer: '',
    labelInstruction: '',
    ingredients: [],
    schedule: [{ slot: 'breakfast', customTime: null, dose: '' }]
  }
  /** 10/7 07:00 KST에 등록 */
  const REGISTERED = new Date('2026-10-06T22:00:00Z')
  /** 10/10 20:00 KST */
  const NOW = new Date('2026-10-10T11:00:00Z')

  it('최근 7일: 등록 전 날은 세지 않고, 기록 없는 날은 놓침', () => {
    const { id } = createSupplement(db, vitaminD, 'manual', REGISTERED)
    recordCheck(db, '2026-10-07', id, 'breakfast', 'taken', REGISTERED)
    recordCheck(db, '2026-10-09', id, 'breakfast', 'skipped', REGISTERED)
    recordCheck(db, '2026-10-10', id, 'breakfast', 'taken', REGISTERED)
    // 10/8은 기록 없음 → 놓침

    const stats = getStatsView(db, 7, NOW)
    expect(stats.days).toHaveLength(7)
    expect(stats.days[0].planDate).toBe('2026-10-04')
    expect(stats.days.at(-1)?.planDate).toBe('2026-10-10')
    expect(stats).toMatchObject({ taken: 2, skipped: 1, missed: 1, rate: 0.5, streak: 1 })
  })

  it('처방약은 처방 기간 동안만 세고, 종류가 표시된다', () => {
    createPrescription(
      db,
      {
        name: '감기약',
        mealTiming: 'after',
        mealOffsetMinutes: 30,
        startDate: '2026-10-09',
        days: 1,
        memo: '',
        schedule: [{ slot: 'dinner', customTime: null, dose: '' }]
      },
      REGISTERED
    )
    const stats = getStatsView(db, 7, NOW)
    expect(stats.products).toEqual([
      { productId: 1, productName: '감기약', kind: 'prescription', taken: 0, skipped: 0, missed: 1, rate: 0 }
    ])
  })

  it('복용 시점을 바꿔도 예전 시점의 기록은 남는다', () => {
    const { id } = createSupplement(db, vitaminD, 'manual', REGISTERED)
    recordCheck(db, '2026-10-07', id, 'breakfast', 'taken', REGISTERED)
    updateSupplement(db, id, { ...vitaminD, schedule: [{ slot: 'dinner', customTime: null, dose: '' }] }, REGISTERED)
    const stats = getStatsView(db, 7, NOW)
    expect(stats.days.find((d) => d.planDate === '2026-10-07')).toMatchObject({ taken: 1 })
  })

  it('30일도 된다', () => {
    expect(getStatsView(db, 30, NOW).days).toHaveLength(30)
  })
})
