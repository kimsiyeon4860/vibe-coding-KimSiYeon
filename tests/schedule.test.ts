import { describe, expect, it } from 'vitest'
import {
  buildDayPlan,
  computeSlotTimes,
  dayBoundary,
  DEFAULT_SETTINGS,
  formatHm,
  parseHm,
  parseSettings,
  planDateFor,
  scheduledAtFor,
  type ScheduleSource
} from '../src/shared/schedule'
import type { IntakeLog, Settings } from '../src/shared/types'

const settings = (overrides: Partial<Settings> = {}): Settings => ({ ...DEFAULT_SETTINGS, ...overrides })

/** 고정 시간 모드 (클릭 기록 없이 설정 시간 그대로) */
const fixedModes = { eventModes: { wake: 'fixed' as const, breakfast: 'fixed' as const, lunch: 'fixed' as const, dinner: 'fixed' as const, bed: 'fixed' as const } }

/** 자정 넘어 자는 사람: 01:00 취침, 08:00 기상 */
const nightOwl = settings({ wakeTime: '08:00', breakfastTime: '09:00', bedTime: '01:00', ...fixedModes })

describe('시간 문자열', () => {
  it('HH:mm ↔ 분', () => {
    expect(parseHm('07:05')).toBe(425)
    expect(parseHm('23:59')).toBe(1439)
    expect(formatHm(425)).toBe('07:05')
  })

  it.each(['24:00', '7:05', '07:60', '', 'abc', null])('잘못된 값 %s 은 null', (value) => {
    expect(parseHm(value)).toBeNull()
  })

  it('하루를 넘거나 음수면 24시간 안으로 감는다', () => {
    expect(formatHm(24 * 60 + 30)).toBe('00:30')
    expect(formatHm(-30)).toBe('23:30')
  })
})

describe('computeSlotTimes', () => {
  it('기본값: 식후 15분, 취침 30분 전', () => {
    expect(computeSlotTimes(DEFAULT_SETTINGS)).toEqual({
      wake: '07:00',
      breakfast: '08:15',
      lunch: '12:45',
      dinner: '18:45',
      bedtime: '23:00'
    })
  })

  it('간격 설정을 반영한다', () => {
    const times = computeSlotTimes(settings({ afterMealMinutes: 0, beforeBedMinutes: 60 }))
    expect(times.breakfast).toBe('08:00')
    expect(times.bedtime).toBe('22:30')
  })

  it('직접 지정한 슬롯은 계산 대신 그 시간', () => {
    const times = computeSlotTimes(settings({ slotOverrides: { lunch: '13:10' } }))
    expect(times.lunch).toBe('13:10')
    expect(times.dinner).toBe('18:45')
  })

  it('자정 넘는 취침: 01:00 − 30분 = 00:30', () => {
    expect(computeSlotTimes(nightOwl).bedtime).toBe('00:30')
  })
})

describe('복용일', () => {
  it('날짜는 취침과 기상의 한가운데에 바뀐다', () => {
    expect(formatHm(dayBoundary(DEFAULT_SETTINGS))).toBe('03:15') // 23:30 ~ 07:00
    expect(formatHm(dayBoundary(nightOwl))).toBe('04:30') // 01:00 ~ 08:00
  })

  it('한국 시간 기준으로 복용일을 정한다', () => {
    // 2026-10-10 10:00 KST
    expect(planDateFor(new Date('2026-10-10T01:00:00Z'), DEFAULT_SETTINGS)).toBe('2026-10-10')
    // 2026-10-10 02:00 KST → 아직 전날 복용일 (경계 03:15)
    expect(planDateFor(new Date('2026-10-09T17:00:00Z'), DEFAULT_SETTINGS)).toBe('2026-10-09')
    // 2026-10-10 03:15 KST → 새 복용일
    expect(planDateFor(new Date('2026-10-09T18:15:00Z'), DEFAULT_SETTINGS)).toBe('2026-10-10')
  })

  it('경계 이전 시각은 다음 날 일시가 된다', () => {
    expect(scheduledAtFor('2026-10-10', '08:15', nightOwl)).toBe('2026-10-10T08:15:00.000+09:00')
    expect(scheduledAtFor('2026-10-10', '00:30', nightOwl)).toBe('2026-10-11T00:30:00.000+09:00')
  })

  it('월말도 다음 달로 넘어간다', () => {
    expect(scheduledAtFor('2026-10-31', '00:30', nightOwl)).toBe('2026-11-01T00:30:00.000+09:00')
  })
})

describe('buildDayPlan', () => {
  const source = (overrides: Partial<ScheduleSource>): ScheduleSource => ({
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
    addedAt: '1970-01-01T00:00:00.000Z',
    ...overrides
  })

  it('시간순으로 정렬하고 같은 시간은 슬롯·이름순', () => {
    const plan = buildDayPlan('2026-10-10', DEFAULT_SETTINGS, [
      source({ productId: 3, productName: '마그네슘', slot: 'bedtime' }),
      source({ productId: 2, productName: '오메가3', slot: 'breakfast' }),
      source({ productId: 1, productName: '비타민D', slot: 'breakfast' }),
      source({ productId: 4, productName: '철분', slot: 'wake' })
    ], [])
    expect(plan.map((e) => [e.time, e.productName])).toEqual([
      ['07:00', '철분'],
      ['08:15', '비타민D'],
      ['08:15', '오메가3'],
      ['23:00', '마그네슘']
    ])
  })

  it('영양제별 직접 지정 시간을 쓴다', () => {
    const [entry] = buildDayPlan('2026-10-10', DEFAULT_SETTINGS, [source({ customTime: '10:00' })], [])
    expect(entry.time).toBe('10:00')
    expect(entry.scheduledAt).toBe('2026-10-10T10:00:00.000+09:00')
  })

  it('자정 넘은 취침 전 항목은 맨 뒤 (다음 날 일시)', () => {
    const plan = buildDayPlan('2026-10-10', nightOwl, [
      source({ productId: 1, productName: '마그네슘', slot: 'bedtime' }),
      source({ productId: 2, productName: '철분', slot: 'wake' })
    ], [])
    expect(plan.map((e) => [e.productName, e.scheduledAt])).toEqual([
      ['철분', '2026-10-10T08:00:00.000+09:00'],
      ['마그네슘', '2026-10-11T00:30:00.000+09:00']
    ])
  })

  it('사용 중지한 영양제는 빠진다', () => {
    const plan = buildDayPlan('2026-10-10', DEFAULT_SETTINGS, [source({ active: false })], [])
    expect(plan).toEqual([])
  })

  it('기록을 보고 상태를 붙인다. 마지막 먹음/건너뜀이 이기고 스누즈는 무시', () => {
    const logs: IntakeLog[] = [
      { productId: 1, slot: 'breakfast', action: 'skipped', actedAt: '2026-10-10T08:20:00.000Z' },
      { productId: 1, slot: 'breakfast', action: 'taken', actedAt: '2026-10-10T08:30:00.000Z' },
      { productId: 1, slot: 'breakfast', action: 'snoozed', actedAt: '2026-10-10T08:40:00.000Z' },
      { productId: 1, slot: 'dinner', action: 'skipped', actedAt: '2026-10-10T19:00:00.000Z' }
    ]
    const plan = buildDayPlan('2026-10-10', DEFAULT_SETTINGS, [
      source({ slot: 'breakfast' }),
      source({ slot: 'lunch' }),
      source({ slot: 'dinner' })
    ], logs)
    expect(plan.map((e) => [e.slot, e.status, e.actedAt])).toEqual([
      ['breakfast', 'taken', '2026-10-10T08:30:00.000Z'],
      ['lunch', 'pending', null],
      ['dinner', 'skipped', '2026-10-10T19:00:00.000Z']
    ])
  })
})

describe('parseSettings', () => {
  it('기본값은 통과', () => {
    expect(parseSettings(DEFAULT_SETTINGS)).toEqual({ ok: true, value: DEFAULT_SETTINGS })
  })

  it('자정 넘는 취침도 통과', () => {
    expect(parseSettings(nightOwl).ok).toBe(true)
  })

  it('식사 순서가 뒤바뀌면 오류', () => {
    const result = parseSettings(settings({ lunchTime: '19:00' }))
    expect(result).toEqual({
      ok: false,
      errors: ['시간 순서가 맞지 않습니다. 기상 → 아침 → 점심 → 저녁 → 취침 순이어야 합니다']
    })
  })

  it('취침이 저녁 식사보다 이르면 오류', () => {
    expect(parseSettings(settings({ bedTime: '17:00' })).ok).toBe(false)
  })

  it('시간 형식이 틀리면 어떤 항목인지 알려준다', () => {
    const result = parseSettings(settings({ lunchTime: '12시' }))
    expect(result).toEqual({ ok: false, errors: ['점심 식사 시간을 확인해 주세요'] })
  })

  it('간격은 0~180 정수. 화면에서 온 문자열 숫자도 받는다', () => {
    expect(parseSettings({ ...DEFAULT_SETTINGS, afterMealMinutes: '20' })).toMatchObject({
      ok: true,
      value: { afterMealMinutes: 20 }
    })
    expect(parseSettings(settings({ afterMealMinutes: 181 })).ok).toBe(false)
    expect(parseSettings(settings({ beforeBedMinutes: 1.5 })).ok).toBe(false)
  })

  it('슬롯 직접 지정: 빈 값은 지정 해제, 잘못된 값은 오류', () => {
    const ok = parseSettings({ ...DEFAULT_SETTINGS, slotOverrides: { wake: '06:30', lunch: '', unknown: '01:00' } })
    expect(ok.ok && ok.value.slotOverrides).toEqual({ wake: '06:30' })
    expect(parseSettings(settings({ slotOverrides: { wake: '6시' } })).ok).toBe(false)
  })
})
