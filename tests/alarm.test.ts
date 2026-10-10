import { describe, expect, it } from 'vitest'
import { decideRing, dueEntries, overdueLabel, toAlarmItem, type RingState } from '../src/shared/alarm'
import { buildDayPlan, DEFAULT_SETTINGS, parseSettings } from '../src/shared/schedule'
import type { DayPlanEntry, IntakeLog } from '../src/shared/types'

const at = (iso: string) => new Date(iso)
const MIN = 60_000

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
  addedAt: '1970-01-01T00:00:00.000Z',
  ...overrides
})

describe('dueEntries', () => {
  it('예정 시각이 되면 울린다 (그 전에는 안 울린다)', () => {
    expect(dueEntries([entry()], at('2026-10-10T08:14:59+09:00'))).toHaveLength(0)
    expect(dueEntries([entry()], at('2026-10-10T08:15:00+09:00'))).toHaveLength(1)
  })

  it('먹음·건너뜀 항목은 울리지 않는다', () => {
    const now = at('2026-10-10T09:00:00+09:00')
    expect(dueEntries([entry({ status: 'taken' }), entry({ status: 'skipped' })], now)).toHaveLength(0)
  })

  it('스누즈가 끝날 때까지 기다린다', () => {
    const snoozed = entry({ snoozedUntil: '2026-10-10T08:30:00.000+09:00' })
    expect(dueEntries([snoozed], at('2026-10-10T08:29:00+09:00'))).toHaveLength(0)
    expect(dueEntries([snoozed], at('2026-10-10T08:30:00+09:00'))).toHaveLength(1)
  })

  it('몇 시간 지나도 대기 중이면 울린다 (꺼져 있던 동안 놓친 알람)', () => {
    expect(dueEntries([entry()], at('2026-10-10T13:00:00+09:00'))).toHaveLength(1)
  })
})

describe('스누즈 기록 → snoozedUntil', () => {
  const sources = [
    {
      productId: 1,
      productName: '비타민D',
      kind: 'supplement' as const,
      active: true,
      slot: 'breakfast' as const,
      customTime: null,
      dose: '',
      mealOffset: null,
      startDate: null,
      endDate: null,
      addedAt: '1970-01-01T00:00:00.000Z'
    }
  ]

  it('마지막 스누즈 시각 + 스누즈 시간', () => {
    const logs: IntakeLog[] = [
      { productId: 1, slot: 'breakfast', action: 'snoozed', actedAt: '2026-10-09T23:15:00.000Z' },
      { productId: 1, slot: 'breakfast', action: 'snoozed', actedAt: '2026-10-09T23:25:00.000Z' }
    ]
    const [e] = buildDayPlan('2026-10-10', { ...DEFAULT_SETTINGS, snoozeMinutes: 10 }, sources, logs)
    expect(e.snoozedUntil).toBe('2026-10-09T23:35:00.000Z')
    expect(e.status).toBe('pending')
  })

  it('스누즈한 적 없으면 null', () => {
    expect(buildDayPlan('2026-10-10', DEFAULT_SETTINGS, sources, [])[0].snoozedUntil).toBeNull()
  })
})

describe('decideRing', () => {
  const settings = { repeatIntervalMinutes: 5, repeatMaxCount: 2 }
  const t0 = at('2026-10-10T08:15:00+09:00')
  const after = (minutes: number) => new Date(t0.getTime() + minutes * MIN)

  it('울릴 항목이 없으면 조용하고 상태를 지운다', () => {
    const prev: RingState = { keys: ['a'], ringCount: 1, lastRingAt: t0.getTime() }
    expect(decideRing(prev, [], t0, settings)).toEqual({ ring: false, state: null })
  })

  it('처음 생긴 항목은 바로 울린다', () => {
    expect(decideRing(null, ['a'], t0, settings)).toEqual({
      ring: true,
      state: { keys: ['a'], ringCount: 1, lastRingAt: t0.getTime() }
    })
  })

  it('간격 전에는 다시 울리지 않는다', () => {
    const first = decideRing(null, ['a'], t0, settings).state
    expect(decideRing(first, ['a'], after(4.5), settings).ring).toBe(false)
  })

  it('간격마다 다시 울리고, 최대 횟수를 넘으면 멈춘다 (팝업은 남음)', () => {
    let state = decideRing(null, ['a'], t0, settings).state
    const rings: boolean[] = []
    for (const minute of [5, 10, 15, 20]) {
      const d = decideRing(state, ['a'], after(minute), settings)
      rings.push(d.ring)
      state = d.state
    }
    // 첫 알림 뒤 최대 2번 더
    expect(rings).toEqual([true, true, false, false])
    expect(state?.keys).toEqual(['a'])
  })

  it('최대 횟수 0이면 첫 알림만', () => {
    const state = decideRing(null, ['a'], t0, { repeatIntervalMinutes: 5, repeatMaxCount: 0 }).state
    expect(decideRing(state, ['a'], after(5), { repeatIntervalMinutes: 5, repeatMaxCount: 0 }).ring).toBe(false)
  })

  it('새 항목이 추가되면 바로 울리고 횟수를 처음부터 센다', () => {
    const tired: RingState = { keys: ['a'], ringCount: 3, lastRingAt: t0.getTime() }
    expect(decideRing(tired, ['a', 'b'], after(1), settings)).toEqual({
      ring: true,
      state: { keys: ['a', 'b'], ringCount: 1, lastRingAt: after(1).getTime() }
    })
  })

  it('항목이 빠지기만 하면 조용히 갱신한다 (오늘 탭에서 하나 체크)', () => {
    const prev: RingState = { keys: ['a', 'b'], ringCount: 1, lastRingAt: t0.getTime() }
    expect(decideRing(prev, ['b'], after(1), settings)).toEqual({
      ring: false,
      state: { keys: ['b'], ringCount: 1, lastRingAt: t0.getTime() }
    })
  })
})

describe('overdueLabel', () => {
  const scheduled = '2026-10-10T08:15:00.000+09:00'
  it.each([
    ['2026-10-10T08:15:30+09:00', ''],
    ['2026-10-10T08:40:00+09:00', '25분 지남'],
    ['2026-10-10T11:15:00+09:00', '3시간 지남'],
    ['2026-10-10T09:20:00+09:00', '1시간 5분 지남']
  ])('%s → "%s"', (now, label) => {
    expect(overdueLabel(scheduled, at(now))).toBe(label)
  })
})

describe('toAlarmItem', () => {
  it('복용일·제품·슬롯으로 key를 만든다', () => {
    expect(toAlarmItem('2026-10-10', entry({ dose: '1정' }))).toEqual({
      key: '2026-10-10|1|breakfast',
      planDate: '2026-10-10',
      productId: 1,
      slot: 'breakfast',
      productName: '비타민D',
      kind: 'supplement',
      dose: '1정',
      time: '08:15',
      scheduledAt: '2026-10-10T08:15:00.000+09:00'
    })
  })
})

describe('알람 설정 검사', () => {
  it('기본값: 소리 켬, 스누즈 10분, 5분마다 최대 6번, 자동 실행 켬', () => {
    expect(DEFAULT_SETTINGS).toMatchObject({
      autoLaunch: true,
      alarmSound: true,
      snoozeMinutes: 10,
      repeatIntervalMinutes: 5,
      repeatMaxCount: 6
    })
  })

  it.each([
    ['snoozeMinutes', 0, '다시 알림(스누즈): 1~60분 사이의 정수로 입력해 주세요'],
    ['repeatIntervalMinutes', 31, '재알림 간격: 1~30분 사이의 정수로 입력해 주세요'],
    ['repeatMaxCount', -1, '재알림 최대 횟수: 0~20회 사이의 정수로 입력해 주세요'],
    ['alarmSound', 'yes', '알람 소리 설정이 올바르지 않습니다'],
    ['autoLaunch', undefined, '자동 실행 설정이 올바르지 않습니다']
  ])('%s = %s 은 오류', (field, value, message) => {
    expect(parseSettings({ ...DEFAULT_SETTINGS, [field]: value })).toEqual({ ok: false, errors: [message] })
  })
})
