import { describe, expect, it } from 'vitest'
import { dueEntries } from '../src/shared/alarm'
import {
  describeTiming,
  parsePrescriptionDraft,
  prescriptionDayNumber,
  prescriptionEndDate,
  prescriptionStatus,
  prescriptionTimes,
  timingChanged
} from '../src/shared/prescription'
import { buildDayPlan, DEFAULT_SETTINGS, type ScheduleSource } from '../src/shared/schedule'
import type { Prescription, PrescriptionDraft } from '../src/shared/types'

const coldMedicine: Prescription = {
  id: 1,
  name: '감기약',
  active: true,
  createdAt: '2026-10-10T05:00:00.000Z',
  mealTiming: 'after',
  mealOffsetMinutes: 30,
  startDate: '2026-10-10',
  days: 5,
  memo: '',
  schedule: [
    { slot: 'breakfast', customTime: null, dose: '1포' },
    { slot: 'lunch', customTime: null, dose: '1포' },
    { slot: 'dinner', customTime: null, dose: '1포' }
  ]
}

describe('처방 기간', () => {
  it('5일 처방: 시작일 포함 5일째가 마지막 날', () => {
    expect(prescriptionEndDate(coldMedicine)).toBe('2026-10-14')
  })

  it('월말을 넘어간다', () => {
    expect(prescriptionEndDate({ startDate: '2026-10-30', days: 3 })).toBe('2026-11-01')
  })

  it('계속 복용이면 마지막 날이 없다', () => {
    expect(prescriptionEndDate({ startDate: '2026-10-10', days: null })).toBeNull()
  })

  it.each([
    ['2026-10-09', 'upcoming'],
    ['2026-10-10', 'ongoing'],
    ['2026-10-14', 'ongoing'],
    ['2026-10-15', 'finished']
  ])('%s → %s', (planDate, status) => {
    expect(prescriptionStatus(coldMedicine, planDate)).toBe(status)
  })

  it('복용 종료하면 기간 중이어도 완료', () => {
    expect(prescriptionStatus({ ...coldMedicine, active: false }, '2026-10-11')).toBe('finished')
  })

  it('계속 복용은 끝나지 않는다', () => {
    expect(prescriptionStatus({ ...coldMedicine, days: null }, '2027-10-10')).toBe('ongoing')
  })

  it('며칠째인지', () => {
    expect(prescriptionDayNumber('2026-10-10', '2026-10-10')).toBe(1)
    expect(prescriptionDayNumber('2026-10-10', '2026-10-12')).toBe(3)
  })
})

describe('처방약 시간', () => {
  it('식후 30분: 아침 08:00 → 08:30 (영양제의 식후 15분과 별개)', () => {
    expect(prescriptionTimes(coldMedicine, DEFAULT_SETTINGS)).toEqual(['08:30', '13:00', '19:00'])
  })

  it('식전 30분', () => {
    expect(prescriptionTimes({ ...coldMedicine, mealTiming: 'before' }, DEFAULT_SETTINGS)).toEqual([
      '07:30',
      '12:00',
      '18:00'
    ])
  })

  it('식사 시간을 바꾸면 따라간다. 슬롯 직접 지정은 무시 (처방 지시 우선)', () => {
    const settings = { ...DEFAULT_SETTINGS, breakfastTime: '09:00', slotOverrides: { breakfast: '10:00' } }
    expect(prescriptionTimes(coldMedicine, settings)[0]).toBe('09:30')
  })

  it('기상 직후·취침 전은 슬롯 시간, 직접 지정한 시간은 그대로', () => {
    const p = {
      ...coldMedicine,
      schedule: [
        { slot: 'wake' as const, customTime: null, dose: '' },
        { slot: 'dinner' as const, customTime: '20:00', dose: '' },
        { slot: 'bedtime' as const, customTime: null, dose: '' }
      ]
    }
    expect(prescriptionTimes(p, DEFAULT_SETTINGS)).toEqual(['07:00', '20:00', '23:00'])
  })

  it('요약 문구', () => {
    expect(describeTiming(coldMedicine)).toBe('식후 30분 · 아침·점심·저녁 (하루 3회)')
    expect(describeTiming({ ...coldMedicine, mealOffsetMinutes: 0 })).toBe('식사 직후 · 아침·점심·저녁 (하루 3회)')
    expect(
      describeTiming({ ...coldMedicine, mealTiming: 'before', mealOffsetMinutes: 0, schedule: coldMedicine.schedule.slice(0, 1) })
    ).toBe('식사 직전 · 아침 (하루 1회)')
  })
})

describe('하루 계획에 처방약 포함', () => {
  const source = (overrides: Partial<ScheduleSource> = {}): ScheduleSource => ({
    productId: 1,
    productName: '감기약',
    kind: 'prescription',
    active: true,
    slot: 'breakfast',
    customTime: null,
    dose: '1포',
    mealOffset: 30,
    startDate: '2026-10-10',
    endDate: '2026-10-14',
    addedAt: '1970-01-01T00:00:00.000Z',
    ...overrides
  })

  it('처방 기간 안에서만 나온다', () => {
    expect(buildDayPlan('2026-10-09', DEFAULT_SETTINGS, [source()], [])).toHaveLength(0)
    expect(buildDayPlan('2026-10-14', DEFAULT_SETTINGS, [source()], [])).toHaveLength(1)
    expect(buildDayPlan('2026-10-15', DEFAULT_SETTINGS, [source()], [])).toHaveLength(0)
  })

  it('계속 복용(endDate null)은 계속 나온다', () => {
    expect(buildDayPlan('2027-01-01', DEFAULT_SETTINGS, [source({ endDate: null })], [])).toHaveLength(1)
  })

  it('식사 기준 시간과 종류가 붙는다', () => {
    const [entry] = buildDayPlan('2026-10-10', DEFAULT_SETTINGS, [source({ mealOffset: -30 })], [])
    expect(entry).toMatchObject({ kind: 'prescription', time: '07:30', dose: '1포' })
  })
})

describe('등록 전에 이미 지난 시간은 울리지 않는다', () => {
  it('14시에 등록한 아침 약: 오늘 목록에는 있지만 알람은 없다', () => {
    const addedAt = '2026-10-10T14:00:00.000+09:00'
    const plan = buildDayPlan(
      '2026-10-10',
      DEFAULT_SETTINGS,
      [
        {
          productId: 1,
          productName: '감기약',
          kind: 'prescription',
          active: true,
          slot: 'breakfast',
          customTime: null,
          dose: '',
          mealOffset: 30,
          startDate: '2026-10-10',
          endDate: null,
          addedAt
        },
        {
          productId: 1,
          productName: '감기약',
          kind: 'prescription',
          active: true,
          slot: 'dinner',
          customTime: null,
          dose: '',
          mealOffset: 30,
          startDate: '2026-10-10',
          endDate: null,
          addedAt
        }
      ],
      []
    )
    expect(plan).toHaveLength(2)
    expect(dueEntries(plan, new Date('2026-10-10T15:00:00+09:00'))).toHaveLength(0)
    expect(dueEntries(plan, new Date('2026-10-10T19:00:00+09:00')).map((e) => e.slot)).toEqual(['dinner'])
  })
})

describe('timingChanged', () => {
  const input = { ...coldMedicine }

  it('이름·메모·기간만 바꾸면 false', () => {
    expect(timingChanged(coldMedicine, { ...input, name: '감기약2', memo: 'x', days: 7 })).toBe(false)
  })

  it('식사 기준·분·먹는 때·직접 지정 시간이 바뀌면 true', () => {
    expect(timingChanged(coldMedicine, { ...input, mealTiming: 'before' })).toBe(true)
    expect(timingChanged(coldMedicine, { ...input, mealOffsetMinutes: 0 })).toBe(true)
    expect(timingChanged(coldMedicine, { ...input, schedule: input.schedule.slice(0, 2) })).toBe(true)
    expect(
      timingChanged(coldMedicine, {
        ...input,
        schedule: [{ ...input.schedule[0], customTime: '09:00' }, ...input.schedule.slice(1)]
      })
    ).toBe(true)
  })

  it('복용량만 바꾸면 false', () => {
    expect(
      timingChanged(coldMedicine, { ...input, schedule: input.schedule.map((s) => ({ ...s, dose: '2포' })) })
    ).toBe(false)
  })
})

describe('parsePrescriptionDraft', () => {
  const draft = (overrides: Partial<PrescriptionDraft> = {}): PrescriptionDraft => ({
    name: '감기약',
    mealTiming: 'after',
    mealOffsetMinutes: '30',
    startDate: '2026-10-10',
    days: '5',
    memo: '',
    schedule: [{ slot: 'breakfast', customTime: '', dose: '1포' }],
    ...overrides
  })

  it('정상 입력', () => {
    expect(parsePrescriptionDraft(draft())).toEqual({
      ok: true,
      value: {
        name: '감기약',
        mealTiming: 'after',
        mealOffsetMinutes: 30,
        startDate: '2026-10-10',
        days: 5,
        memo: '',
        schedule: [{ slot: 'breakfast', customTime: null, dose: '1포' }]
      }
    })
  })

  it('처방 일수를 비우면 계속 복용', () => {
    const result = parsePrescriptionDraft(draft({ days: '' }))
    expect(result.ok && result.value.days).toBeNull()
  })

  it.each([
    [{ name: ' ' }, '약 이름을 입력해 주세요'],
    [{ mealTiming: 'with' }, '식전·식후를 골라 주세요'],
    [{ mealOffsetMinutes: '121' }, '식전·식후 시간은 0~120분 사이의 정수로 입력해 주세요'],
    [{ mealOffsetMinutes: '' }, '식전·식후 시간은 0~120분 사이의 정수로 입력해 주세요'],
    [{ startDate: '2026-02-30' }, '시작일을 확인해 주세요'],
    [{ days: '0' }, '처방 일수는 1~365일 사이의 정수로 입력해 주세요 (계속 복용이면 비워 두세요)'],
    [{ schedule: [] }, '먹는 때를 하나 이상 골라 주세요']
  ])('%o → %s', (overrides, message) => {
    expect(parsePrescriptionDraft(draft(overrides as Partial<PrescriptionDraft>))).toEqual({
      ok: false,
      errors: [message]
    })
  })
})
