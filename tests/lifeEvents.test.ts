import type { DatabaseSync } from 'node:sqlite'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { openDatabase } from '../src/main/db/connection'
import { MIGRATIONS } from '../src/main/db/migrations'
import { createPrescription } from '../src/main/db/prescriptions'
import { saveSettings } from '../src/main/db/settings'
import { createSupplement } from '../src/main/db/supplements'
import { clearLifeEvent, getDayPlan, getTodayView, recordLifeEvent } from '../src/main/today'
import { dueEntries } from '../src/shared/alarm'
import {
  buildDayPlan,
  DEFAULT_SETTINGS,
  isWakePromptTime,
  parseSettings,
  type ScheduleSource
} from '../src/shared/schedule'
import type { Settings } from '../src/shared/types'

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

const plan = (sources: ScheduleSource[], events = {}, settings: Settings = DEFAULT_SETTINGS) =>
  buildDayPlan(DATE, settings, sources, [], events)

describe('클릭 기록 모드 (기본)', () => {
  it('기록이 없으면 기록 대기, 평소 시간 + 60분에 알림', () => {
    const [e] = plan([source()])
    expect(e).toMatchObject({ waitingFor: 'breakfast', time: '08:15', scheduledAt: at('09:15') })
  })

  it("'일어났어요'를 누르면 기상 직후 항목은 바로", () => {
    const [e] = plan([source({ slot: 'wake' })], { wake: at('10:20') })
    expect(e).toMatchObject({ waitingFor: null, time: '10:20', scheduledAt: at('10:20') })
  })

  it('식사를 기록하면 식후 간격(15분) 뒤', () => {
    const [e] = plan([source()], { breakfast: '2026-10-10T00:40:00.000Z' }) // 09:40 KST
    expect(e).toMatchObject({ waitingFor: null, time: '09:55', scheduledAt: at('09:55') })
  })

  it("처방약 '식후 30분'은 식사 기록 + 30분", () => {
    const [e] = plan([source({ kind: 'prescription', mealOffset: 30 })], { breakfast: at('09:40') })
    expect(e.scheduledAt).toBe(at('10:10'))
  })

  it("처방약 '식전 30분'은 미리 알 수 없어 고정 시간 그대로", () => {
    const [e] = plan([source({ kind: 'prescription', mealOffset: -30 })], { breakfast: at('09:40') })
    expect(e).toMatchObject({ waitingFor: null, time: '07:30', scheduledAt: at('07:30') })
  })

  it('영양제별로 직접 지정한 시간은 그대로', () => {
    const [e] = plan([source({ customTime: '11:00' })], { breakfast: at('09:40') })
    expect(e).toMatchObject({ waitingFor: null, scheduledAt: at('11:00') })
  })

  it("'잘게요'를 누르면 취침 전 항목은 바로 (자정 넘어도 같은 복용일)", () => {
    const [e] = plan([source({ slot: 'bedtime' })], { bed: '2026-10-11T00:50:00.000+09:00' })
    expect(e.scheduledAt).toBe('2026-10-11T00:50:00.000+09:00')
  })

  it('고정 시간 모드인 사건은 기록이 있어도 설정 시간', () => {
    const settings = { ...DEFAULT_SETTINGS, eventModes: { ...DEFAULT_SETTINGS.eventModes, breakfast: 'fixed' as const } }
    const [e] = plan([source()], { breakfast: at('09:40') }, settings)
    expect(e).toMatchObject({ waitingFor: null, scheduledAt: at('08:15') })
  })

  it('알람: 기록 대기 중에는 울리지 않고, 기록하면 그 시각에 맞춰 울린다', () => {
    const waiting = plan([source()])
    expect(dueEntries(waiting, new Date(at('09:00')))).toHaveLength(0)
    // 식사는 평소 + 60분이 지나도 알람 대신 "드셨어요?"를 묻는다 (8-2)
    expect(dueEntries(waiting, new Date(at('09:15')))).toHaveLength(0)
    // 기상·취침은 기록이 없으면 평소 + 60분에 그냥 알린다
    expect(dueEntries(plan([source({ slot: 'wake' })]), new Date(at('08:00')))).toHaveLength(1)

    const recorded = plan([source()], { breakfast: at('08:50') })
    expect(dueEntries(recorded, new Date(at('09:04')))).toHaveLength(0)
    expect(dueEntries(recorded, new Date(at('09:05')))).toHaveLength(1)
  })
})

describe('설정 검사', () => {
  it('기본값: 모두 클릭 기록, 60분', () => {
    expect(parseSettings(DEFAULT_SETTINGS)).toEqual({ ok: true, value: DEFAULT_SETTINGS })
  })

  it('잘못된 방식·대기 시간은 오류 (한 번만)', () => {
    const bad = parseSettings({ ...DEFAULT_SETTINGS, eventModes: { wake: 'auto' }, eventFallbackMinutes: 5 })
    expect(bad).toEqual({
      ok: false,
      errors: ['기록이 없을 때 알림: 15~240분 사이의 정수로 입력해 주세요', '생활 기록 방식 설정이 올바르지 않습니다']
    })
  })
})

describe('기상 기록을 물어봐도 되는 시각', () => {
  it('평소 기상(07:00) 3시간 전부터', () => {
    expect(isWakePromptTime(new Date(at('03:59')), DEFAULT_SETTINGS)).toBe(false)
    expect(isWakePromptTime(new Date(at('04:00')), DEFAULT_SETTINGS)).toBe(true)
    expect(isWakePromptTime(new Date(at('15:00')), DEFAULT_SETTINGS)).toBe(true)
  })

  it('밤늦게 깨어 있는 시간(경계 직후 새벽)에는 묻지 않는다', () => {
    const owl = { ...DEFAULT_SETTINGS, wakeTime: '10:00', breakfastTime: '10:30', bedTime: '02:00' }
    expect(isWakePromptTime(new Date(at('06:30')), owl)).toBe(false)
    expect(isWakePromptTime(new Date(at('07:00')), owl)).toBe(true)
  })
})

describe('DB: 생활 기록', () => {
  let db: DatabaseSync
  beforeEach(() => {
    db = openDatabase(':memory:')
  })
  afterEach(() => db.close())

  const vitaminD = {
    name: '비타민D',
    manufacturer: '',
    labelInstruction: '',
    ingredients: [],
    schedule: [{ slot: 'breakfast' as const, customTime: null, dose: '' }]
  }
  /** 10/10 09:40 KST */
  const NOW = new Date('2026-10-10T00:40:00Z')

  it('마이그레이션 4까지 적용', () => {
    const { user_version } = db.prepare('PRAGMA user_version').get() as { user_version: number }
    expect(user_version).toBe(MIGRATIONS.length)
    expect(MIGRATIONS.length).toBeGreaterThanOrEqual(4)
  })

  it('지금 기록 → 오늘 화면과 계획에 반영, 다시 기록하면 바뀌고, 지우면 대기로', () => {
    createSupplement(db, vitaminD, 'manual', new Date('2026-10-01T00:00:00Z'))
    recordLifeEvent(db, DATE, 'breakfast', undefined, NOW)
    expect(getTodayView(db, NOW).events).toEqual({ breakfast: NOW.toISOString() })
    expect(getDayPlan(db, DATE)[0]).toMatchObject({ waitingFor: null, time: '09:55' })

    recordLifeEvent(db, DATE, 'breakfast', '08:00')
    expect(getDayPlan(db, DATE)[0].time).toBe('08:15')

    clearLifeEvent(db, DATE, 'breakfast')
    expect(getDayPlan(db, DATE)[0]).toMatchObject({ waitingFor: 'breakfast' })
  })

  it('시각을 지정해 기록 (자정 넘은 취침은 다음 날 일시)', () => {
    recordLifeEvent(db, DATE, 'bed', '00:30')
    expect(getTodayView(db, NOW).events.bed).toBe('2026-10-11T00:30:00.000+09:00')
  })

  it("오늘 화면: '클릭 기록' 모드인 사건만 버튼으로", () => {
    saveSettings(db, { ...DEFAULT_SETTINGS, eventModes: { ...DEFAULT_SETTINGS.eventModes, lunch: 'fixed' } })
    expect(getTodayView(db, NOW).clickEvents).toEqual(['wake', 'breakfast', 'dinner', 'bed'])
  })

  it('처방약도 식사 기록을 따른다 (식후 30분)', () => {
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
      new Date('2026-10-01T00:00:00Z')
    )
    recordLifeEvent(db, DATE, 'lunch', '13:20')
    expect(getDayPlan(db, DATE)[0]).toMatchObject({ kind: 'prescription', time: '13:50' })
  })
})
