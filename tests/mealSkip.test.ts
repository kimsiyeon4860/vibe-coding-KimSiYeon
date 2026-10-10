import type { SqlDatabase } from '../src/core/db/sql'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { openDatabase } from '../src/main/db/connection'
import { MIGRATIONS } from '../src/core/db/migrations'
import { createSupplement } from '../src/core/db/supplements'
import { clearLifeEvent, getDayPlan, getStatsView, getTodayView, recordLifeEvent, skipMeal } from '../src/core/today'
import { dueEntries, mealSkipNote, pendingMealQuestions, toAlarmItem } from '../src/shared/alarm'
import { buildDayPlan, DEFAULT_SETTINGS, type ScheduleSource } from '../src/shared/schedule'

const DATE = '2026-10-10'
const at = (hm: string) => `${DATE}T${hm}:00.000+09:00`
const OLD = '1970-01-01T00:00:00.000Z'

const source = (overrides: Partial<ScheduleSource> = {}): ScheduleSource => ({
  productId: 1,
  productName: '비타민D',
  kind: 'supplement',
  active: true,
  slot: 'breakfast',
  customTime: null,
  dose: '',
  mealOffset: null,
  startDate: null,
  endDate: null,
  addedAt: OLD,
  ...overrides
})

describe('식사를 거르면', () => {
  it('영양제는 다음 식사로 옮겨 그 식사 기록에 맞춰 알린다', () => {
    const [e] = buildDayPlan(DATE, DEFAULT_SETTINGS, [source()], [], { lunch: at('12:40') }, { breakfast: at('09:30') })
    expect(e).toMatchObject({ slot: 'breakfast', mealSkip: 'carried', carriedTo: 'lunch', scheduledAt: at('12:55') })
    expect(mealSkipNote(e)).toBe('아침을 걸러 점심 식후에 함께 알려 드려요.')
  })

  it('다음 식사도 기록 전이면 그 식사를 함께 기다린다', () => {
    const [e] = buildDayPlan(DATE, DEFAULT_SETTINGS, [source()], [], {}, { breakfast: at('09:30') })
    expect(e).toMatchObject({ mealSkip: 'carried', carriedTo: 'lunch', waitingFor: 'lunch' })
  })

  it('점심도 거르면 저녁으로, 저녁까지 거르면 오늘은 알리지 않는다', () => {
    const skips = { breakfast: at('09:30'), lunch: at('13:30') }
    expect(buildDayPlan(DATE, DEFAULT_SETTINGS, [source()], [], {}, skips)[0]).toMatchObject({ carriedTo: 'dinner' })
    const [dropped] = buildDayPlan(DATE, DEFAULT_SETTINGS, [source({ slot: 'dinner' })], [], {}, { dinner: at('20:00') })
    expect(dropped).toMatchObject({ mealSkip: 'dropped', carriedTo: null })
    expect(dueEntries([dropped], new Date(at('23:00')))).toEqual([])
  })

  it('처방약은 옮기지 않고 거른 시각에 바로 알리며 약사 지시 안내', () => {
    const [e] = buildDayPlan(
      DATE,
      DEFAULT_SETTINGS,
      [source({ kind: 'prescription', mealOffset: 30 })],
      [],
      {},
      { breakfast: at('09:30') }
    )
    expect(e).toMatchObject({ mealSkip: 'prescription', scheduledAt: at('09:30'), carriedTo: null })
    expect(dueEntries([e], new Date(at('09:30')))).toHaveLength(1)
    expect(toAlarmItem(DATE, e).note).toContain('처방 약사의 지시')
  })

  it('처방약 식전·직접 지정 시간은 거름과 상관없이 그대로', () => {
    const skips = { breakfast: at('09:30') }
    const sources = [source({ kind: 'prescription', mealOffset: -30 }), source({ productId: 2, customTime: '10:00' })]
    expect(buildDayPlan(DATE, DEFAULT_SETTINGS, sources, [], {}, skips).map((e) => [e.mealSkip, e.time])).toEqual([
      [null, '07:30'],
      [null, '10:00']
    ])
  })
})

describe('"드셨어요?" 확인', () => {
  const settings = DEFAULT_SETTINGS

  it('평소 식사 시간 + 60분이 지나도 기록이 없고, 기다리는 항목이 있으면 묻는다', () => {
    const entries = buildDayPlan(DATE, settings, [source()], [])
    expect(pendingMealQuestions(entries, {}, {}, settings, new Date(at('09:14')))).toEqual([])
    expect(pendingMealQuestions(entries, {}, {}, settings, new Date(at('09:15')))).toEqual(['breakfast'])
  })

  it('등록하기 전에 이미 지난 식사는 묻지 않는다 (오후에 아침 영양제를 등록한 날)', () => {
    const entries = buildDayPlan(DATE, settings, [source({ addedAt: at('14:00') })], [])
    expect(pendingMealQuestions(entries, {}, {}, settings, new Date(at('15:00')))).toEqual([])
  })

  it('그 식사에 먹을 항목이 없으면 묻지 않는다', () => {
    const entries = buildDayPlan(DATE, settings, [source({ slot: 'dinner' })], [])
    expect(pendingMealQuestions(entries, {}, {}, settings, new Date(at('10:00')))).toEqual([])
  })

  it('기록했거나 거렀거나, 이미 먹었으면 묻지 않는다', () => {
    const entries = buildDayPlan(DATE, settings, [source()], [])
    const late = new Date(at('11:00'))
    expect(pendingMealQuestions(entries, { breakfast: at('09:00') }, {}, settings, late)).toEqual([])
    expect(pendingMealQuestions(entries, {}, { breakfast: at('09:00') }, settings, late)).toEqual([])
    const taken = entries.map((e) => ({ ...e, status: 'taken' as const }))
    expect(pendingMealQuestions(taken, {}, {}, settings, late)).toEqual([])
  })

  it('고정 시간 모드인 식사는 묻지 않는다', () => {
    const fixed = { ...settings, eventModes: { ...settings.eventModes, breakfast: 'fixed' as const } }
    const entries = buildDayPlan(DATE, fixed, [source()], [])
    expect(pendingMealQuestions(entries, {}, {}, fixed, new Date(at('11:00')))).toEqual([])
  })

  it('옮겨 간 영양제 때문에 다음 식사도 묻는다', () => {
    const entries = buildDayPlan(DATE, settings, [source()], [], {}, { breakfast: at('09:30') })
    expect(pendingMealQuestions(entries, {}, { breakfast: at('09:30') }, settings, new Date(at('13:45')))).toEqual([
      'lunch'
    ])
  })
})

describe('DB: 식사 거름', () => {
  let db: SqlDatabase
  beforeEach(() => {
    db = openDatabase(':memory:')
  })
  afterEach(() => db.close())

  const vitaminD = {
    name: '비타민D',
    manufacturer: '',
    labelInstruction: '',
    ingredients: [],
    schedule: [{ slot: 'dinner' as const, customTime: null, dose: '' }]
  }

  it('마이그레이션 5까지', () => {
    expect(MIGRATIONS.length).toBeGreaterThanOrEqual(5)
    const { user_version } = db.prepare('PRAGMA user_version').get() as { user_version: number }
    expect(user_version).toBe(MIGRATIONS.length)
  })

  it('거름 ↔ 기록은 서로 바뀌고, 지우면 둘 다 없어진다', () => {
    skipMeal(db, DATE, 'lunch', new Date(at('13:00')))
    expect(getTodayView(db, new Date(at('13:00')))).toMatchObject({ skips: { lunch: expect.any(String) }, events: {} })
    recordLifeEvent(db, DATE, 'lunch', '13:10')
    expect(getTodayView(db, new Date(at('13:20')))).toMatchObject({ skips: {}, events: { lunch: at('13:10') } })
    clearLifeEvent(db, DATE, 'lunch')
    expect(getTodayView(db, new Date(at('13:20')))).toMatchObject({ skips: {}, events: {} })
  })

  it('저녁을 걸러 오늘 알리지 않은 영양제는 통계에서 놓침으로 세지 않는다', () => {
    createSupplement(db, vitaminD, 'manual', new Date('2026-10-01T00:00:00Z'))
    skipMeal(db, DATE, 'dinner', new Date(at('20:00')))
    expect(getDayPlan(db, DATE)[0].mealSkip).toBe('dropped')
    const stats = getStatsView(db, 7, new Date(at('23:00')))
    expect(stats.days.at(-1)).toMatchObject({ planDate: DATE, missed: 0 })
  })
})
