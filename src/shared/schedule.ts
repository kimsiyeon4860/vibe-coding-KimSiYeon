// 복용 시간 계산 (순수 함수). 메인 프로세스(오늘 목록·3-2단계 스케줄러)와 화면(미리보기)이 함께 쓴다.
//
// '복용일' 개념: 하루는 자정이 아니라 '잠자는 시간의 한가운데'에 바뀐다.
// 예) 취침 01:00, 기상 07:00 → 04:00에 날짜가 바뀌므로, 새벽 00:30의 '취침 전' 알람은 전날 복용일에 속한다.
import { TZDate } from '@date-fns/tz'
import { addMinutes, format, subDays } from 'date-fns'
import {
  SLOTS,
  type CheckAction,
  type DayPlanEntry,
  type Hm,
  type IntakeLog,
  type ParseResult,
  type Settings,
  type Slot
} from './types'

export const TIME_ZONE = 'Asia/Seoul'
const DAY_MINUTES = 24 * 60
const OFFSET_MAX = 180

export const DEFAULT_SETTINGS: Settings = {
  wakeTime: '07:00',
  breakfastTime: '08:00',
  lunchTime: '12:30',
  dinnerTime: '18:30',
  bedTime: '23:30',
  afterMealMinutes: 15,
  beforeBedMinutes: 30,
  slotOverrides: {}
}

// ---------------------------------------------------------------- 시간 문자열

/** "HH:mm" → 자정부터의 분. 형식이 틀리면 null */
export function parseHm(value: unknown): number | null {
  if (typeof value !== 'string') return null
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(value.trim())
  return match ? Number(match[1]) * 60 + Number(match[2]) : null
}

/** 분 → "HH:mm". 하루를 넘거나 음수면 24시간 안으로 감는다 */
export function formatHm(minutes: number): Hm {
  const m = ((minutes % DAY_MINUTES) + DAY_MINUTES) % DAY_MINUTES
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
}

/** 검사를 통과한 설정의 시간 값용 (형식이 틀릴 일이 없다) */
const minutesOf = (hm: Hm): number => parseHm(hm) ?? 0

// ---------------------------------------------------------------- 슬롯 시간

/** 설정으로부터 슬롯별 알람 시간을 계산. 직접 지정한 슬롯은 그 시간을 쓴다 */
export function computeSlotTimes(settings: Settings): Record<Slot, Hm> {
  const computed: Record<Slot, number> = {
    wake: minutesOf(settings.wakeTime),
    breakfast: minutesOf(settings.breakfastTime) + settings.afterMealMinutes,
    lunch: minutesOf(settings.lunchTime) + settings.afterMealMinutes,
    dinner: minutesOf(settings.dinnerTime) + settings.afterMealMinutes,
    bedtime: minutesOf(settings.bedTime) - settings.beforeBedMinutes
  }
  const result = {} as Record<Slot, Hm>
  for (const slot of SLOTS) result[slot] = settings.slotOverrides[slot] ?? formatHm(computed[slot])
  return result
}

// ---------------------------------------------------------------- 복용일

/** 복용일이 바뀌는 시각(자정부터의 분) = 취침과 기상 사이의 한가운데 */
export function dayBoundary(settings: Settings): number {
  const bed = minutesOf(settings.bedTime)
  const sleep = (minutesOf(settings.wakeTime) - bed + DAY_MINUTES) % DAY_MINUTES
  return (bed + Math.floor(sleep / 2)) % DAY_MINUTES
}

/** 지금 시각이 속한 복용일 "yyyy-MM-dd" (한국 시간 기준) */
export function planDateFor(now: Date, settings: Settings): string {
  const local = new TZDate(now.getTime(), TIME_ZONE)
  const minutes = local.getHours() * 60 + local.getMinutes()
  const day = minutes < dayBoundary(settings) ? subDays(local, 1) : local
  return format(day, 'yyyy-MM-dd')
}

/** 복용일의 시각 "HH:mm"을 실제 일시(ISO, +09:00)로. 날짜 경계 이전 시각은 다음 날이다 */
export function scheduledAtFor(planDate: string, time: Hm, settings: Settings): string {
  const [year, month, day] = planDate.split('-').map(Number)
  const minutes = minutesOf(time)
  const offset = minutes < dayBoundary(settings) ? minutes + DAY_MINUTES : minutes
  return addMinutes(new TZDate(year, month - 1, day, 0, 0, TIME_ZONE), offset).toISOString()
}

/** ISO 일시 → 한국 시간 "HH:mm" */
export function clockOf(iso: string): Hm {
  return format(new TZDate(new Date(iso).getTime(), TIME_ZONE), 'HH:mm')
}

export function isPlanDate(value: unknown): value is string {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
}

// ---------------------------------------------------------------- 하루 계획

/** 하루 계획을 만들 재료: 영양제 × 슬롯 한 줄 */
export interface ScheduleSource {
  productId: number
  productName: string
  active: boolean
  slot: Slot
  customTime: Hm | null
  dose: string
}

/**
 * 복용일 하루의 복용 목록을 시간순으로 만들고, 기록을 보고 상태를 붙인다.
 * @param logs 그 복용일의 기록 (오래된 것부터). 같은 항목은 마지막 먹음/건너뜀이 상태가 된다
 */
export function buildDayPlan(
  planDate: string,
  settings: Settings,
  sources: ScheduleSource[],
  logs: IntakeLog[]
): DayPlanEntry[] {
  const slotTimes = computeSlotTimes(settings)
  const key = (productId: number, slot: Slot) => `${productId}:${slot}`

  const finalLogs = new Map<string, IntakeLog>()
  for (const log of logs) {
    if (log.action === 'taken' || log.action === 'skipped') finalLogs.set(key(log.productId, log.slot), log)
  }

  const entries: DayPlanEntry[] = sources
    .filter((s) => s.active)
    .map((s) => {
      const time = s.customTime ?? slotTimes[s.slot]
      const final = finalLogs.get(key(s.productId, s.slot))
      return {
        productId: s.productId,
        productName: s.productName,
        slot: s.slot,
        dose: s.dose,
        time,
        scheduledAt: scheduledAtFor(planDate, time, settings),
        status: final ? (final.action as CheckAction) : 'pending',
        actedAt: final?.actedAt ?? null
      }
    })

  // 모두 +09:00 형식이라 문자열 비교로 시간순 정렬이 된다
  return entries.sort(
    (a, b) =>
      a.scheduledAt.localeCompare(b.scheduledAt) ||
      SLOTS.indexOf(a.slot) - SLOTS.indexOf(b.slot) ||
      a.productName.localeCompare(b.productName, 'ko')
  )
}

// ---------------------------------------------------------------- 설정 검사

const TIME_FIELDS = [
  ['wakeTime', '기상'],
  ['breakfastTime', '아침 식사'],
  ['lunchTime', '점심 식사'],
  ['dinnerTime', '저녁 식사'],
  ['bedTime', '취침']
] as const

/** 설정 입력값 검사. IPC로 넘어온 값도 믿지 않도록 unknown으로 받는다 */
export function parseSettings(raw: unknown): ParseResult<Settings> {
  if (typeof raw !== 'object' || raw === null) return { ok: false, errors: ['설정 형식이 올바르지 않습니다'] }
  const input = raw as Record<string, unknown>
  const errors: string[] = []

  const times = {} as Record<(typeof TIME_FIELDS)[number][0], number>
  for (const [field, label] of TIME_FIELDS) {
    const minutes = parseHm(input[field])
    if (minutes === null) errors.push(`${label} 시간을 확인해 주세요`)
    times[field] = minutes ?? 0
  }

  const afterMealMinutes = parseOffset(input.afterMealMinutes, '식후 알람 간격', errors)
  const beforeBedMinutes = parseOffset(input.beforeBedMinutes, '취침 전 알람 간격', errors)

  // 기상 → 아침 → 점심 → 저녁 → 취침 순서인지 (취침은 자정을 넘어도 된다)
  if (errors.length === 0) {
    const fromWake = (m: number) => (m - times.wakeTime + DAY_MINUTES) % DAY_MINUTES
    const order = [times.breakfastTime, times.lunchTime, times.dinnerTime, times.bedTime].map(fromWake)
    if (!order.every((v, i) => i === 0 || order[i - 1] < v)) {
      errors.push('시간 순서가 맞지 않습니다. 기상 → 아침 → 점심 → 저녁 → 취침 순이어야 합니다')
    }
  }

  const slotOverrides: Partial<Record<Slot, Hm>> = {}
  const rawOverrides = input.slotOverrides
  if (typeof rawOverrides === 'object' && rawOverrides !== null) {
    for (const slot of SLOTS) {
      const value = (rawOverrides as Record<string, unknown>)[slot]
      if (value === undefined || value === null || value === '') continue
      const minutes = parseHm(value)
      if (minutes === null) errors.push(`직접 지정한 슬롯 시간을 확인해 주세요`)
      else slotOverrides[slot] = formatHm(minutes)
    }
  }

  if (errors.length > 0) return { ok: false, errors }
  return {
    ok: true,
    value: {
      wakeTime: formatHm(times.wakeTime),
      breakfastTime: formatHm(times.breakfastTime),
      lunchTime: formatHm(times.lunchTime),
      dinnerTime: formatHm(times.dinnerTime),
      bedTime: formatHm(times.bedTime),
      afterMealMinutes,
      beforeBedMinutes,
      slotOverrides
    }
  }
}

function parseOffset(value: unknown, label: string, errors: string[]): number {
  const n = typeof value === 'string' && value.trim() !== '' ? Number(value) : value
  if (typeof n !== 'number' || !Number.isInteger(n) || n < 0 || n > OFFSET_MAX) {
    errors.push(`${label}은 0~${OFFSET_MAX}분 사이의 정수로 입력해 주세요`)
    return 0
  }
  return n
}
