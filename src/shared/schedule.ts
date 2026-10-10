// 복용 시간 계산 (순수 함수). 메인 프로세스(오늘 목록·3-2단계 스케줄러)와 화면(미리보기)이 함께 쓴다.
//
// '복용일' 개념: 하루는 자정이 아니라 '잠자는 시간의 한가운데'에 바뀐다.
// 예) 취침 01:00, 기상 07:00 → 04:00에 날짜가 바뀌므로, 새벽 00:30의 '취침 전' 알람은 전날 복용일에 속한다.
import { TZDate } from '@date-fns/tz'
import { addMinutes, format, subDays } from 'date-fns'
import {
  LIFE_EVENTS,
  SLOT_EVENT,
  SLOTS,
  type CheckAction,
  type DayEvents,
  type EventMode,
  type LifeEvent,
  type DayPlanEntry,
  type Hm,
  type IntakeLog,
  type ParseResult,
  type ProductKind,
  type Settings,
  type Slot
} from './types'

export const TIME_ZONE = 'Asia/Seoul'
const DAY_MINUTES = 24 * 60
const MINUTE_MS = 60_000

export const DEFAULT_SETTINGS: Settings = {
  wakeTime: '07:00',
  breakfastTime: '08:00',
  lunchTime: '12:30',
  dinnerTime: '18:30',
  bedTime: '23:30',
  afterMealMinutes: 15,
  beforeBedMinutes: 30,
  slotOverrides: {},
  alarmSound: true,
  snoozeMinutes: 10,
  repeatIntervalMinutes: 5,
  repeatMaxCount: 6,
  autoLaunch: true,
  eventModes: { wake: 'click', breakfast: 'click', lunch: 'click', dinner: 'click', bed: 'click' },
  eventFallbackMinutes: 60
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

/**
 * 그날 기상 기록을 물어봐도 되는 시각인지: 평소 기상 시간 N분 전부터 (복용일 경계 기준).
 * 밤늦게까지 깨어 있는 사람에게 새벽에 '일어나셨나요?'를 묻지 않으려는 것.
 */
export function isWakePromptTime(now: Date, settings: Settings, leadMinutes = 180): boolean {
  const boundary = dayBoundary(settings)
  const local = new TZDate(now.getTime(), TIME_ZONE)
  const rel = (minutes: number) => (minutes - boundary + DAY_MINUTES) % DAY_MINUTES
  return rel(local.getHours() * 60 + local.getMinutes()) >= rel(minutesOf(settings.wakeTime)) - leadMinutes
}

export function isPlanDate(value: unknown): value is string {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
}

// ---------------------------------------------------------------- 하루 계획

/** 하루 계획을 만들 재료: 영양제 × 슬롯 한 줄 */
export interface ScheduleSource {
  productId: number
  productName: string
  kind: ProductKind
  active: boolean
  slot: Slot
  customTime: Hm | null
  dose: string
  /** 처방약: 식사 시간 기준 분 (식전 −N, 식후 +N). 영양제는 null → 슬롯 시간 */
  mealOffset: number | null
  /** 처방약 복용 기간 (복용일 "yyyy-MM-dd"). 영양제·계속 복용은 null */
  startDate: string | null
  endDate: string | null
  /** 이 복용 시점을 등록한 일시 (ISO 8601) */
  addedAt: string
}

const MEAL_FIELDS: Partial<Record<Slot, 'breakfastTime' | 'lunchTime' | 'dinnerTime'>> = {
  breakfast: 'breakfastTime',
  lunch: 'lunchTime',
  dinner: 'dinnerTime'
}

/**
 * 처방약의 슬롯 시간: 아침·점심·저녁은 '식사 시간 ± N분'(슬롯 직접 지정은 무시 — 처방 지시 우선),
 * 기상 직후·취침 전은 영양제와 같은 슬롯 시간.
 */
export function prescriptionSlotTime(slot: Slot, mealOffset: number, settings: Settings): Hm {
  const mealField = MEAL_FIELDS[slot]
  if (!mealField) return computeSlotTimes(settings)[slot]
  return formatHm(minutesOf(settings[mealField]) + mealOffset)
}

/** 그 복용일에 먹는 항목인지 (사용 중 + 처방 기간 안) */
function isOnPlanDate(source: ScheduleSource, planDate: string): boolean {
  if (!source.active) return false
  if (source.startDate !== null && planDate < source.startDate) return false
  if (source.endDate !== null && planDate > source.endDate) return false
  return true
}

/** 일시(ms)를 한국 시간 ISO(+09:00)로 — 정렬을 위해 모든 예정 일시를 같은 형식으로 */
function toSeoulIso(ms: number): string {
  return new TZDate(ms, TIME_ZONE).toISOString()
}

/**
 * 항목의 실제 알람 일시. '클릭 기록' 모드의 사건에 묶인 슬롯은:
 * - 기록이 있으면 기록 시각 + (식사면 식후 N분, 처방약이면 처방의 식후 N분, 기상·취침은 바로)
 * - 기록이 없으면 평소 시간 + 대기 시간(eventFallbackMinutes)에 알리고, 그동안 '기록 대기'
 * 고정 시간을 유지하는 경우: 영양제별 직접 지정 시간, 처방약 식전 N분(식사 시작을 미리 알 수 없음), '고정 시간' 모드.
 */
function resolveTiming(
  source: ScheduleSource,
  plannedTime: Hm,
  planDate: string,
  settings: Settings,
  events: DayEvents
): { time: Hm; scheduledAt: string; waitingFor: LifeEvent | null } {
  const planned = { time: plannedTime, scheduledAt: scheduledAtFor(planDate, plannedTime, settings), waitingFor: null }
  if (source.customTime !== null) return planned
  const event = SLOT_EVENT[source.slot]
  if (settings.eventModes[event] !== 'click') return planned
  const isMeal = MEAL_FIELDS[source.slot] !== undefined
  if (isMeal && source.mealOffset !== null && source.mealOffset < 0) return planned

  const recorded = events[event]
  if (recorded) {
    const offset = isMeal ? (source.mealOffset ?? settings.afterMealMinutes) : 0
    const scheduledAt = toSeoulIso(Date.parse(recorded) + offset * MINUTE_MS)
    return { time: clockOf(scheduledAt), scheduledAt, waitingFor: null }
  }
  const fallback = Date.parse(planned.scheduledAt) + settings.eventFallbackMinutes * MINUTE_MS
  return { time: plannedTime, scheduledAt: toSeoulIso(fallback), waitingFor: event }
}

/**
 * 복용일 하루의 복용 목록을 시간순으로 만들고, 기록을 보고 상태를 붙인다.
 * @param logs 그 복용일의 기록 (오래된 것부터). 같은 항목은 마지막 먹음/건너뜀이 상태가 된다
 * @param events 그 복용일의 생활 기록 ('클릭 기록' 모드에서 알람 시각의 기준)
 */
export function buildDayPlan(
  planDate: string,
  settings: Settings,
  sources: ScheduleSource[],
  logs: IntakeLog[],
  events: DayEvents = {}
): DayPlanEntry[] {
  const slotTimes = computeSlotTimes(settings)
  const key = (productId: number, slot: Slot) => `${productId}:${slot}`

  const finalLogs = new Map<string, IntakeLog>()
  const lastSnoozes = new Map<string, IntakeLog>()
  for (const log of logs) {
    if (log.action === 'taken' || log.action === 'skipped') finalLogs.set(key(log.productId, log.slot), log)
    if (log.action === 'snoozed') lastSnoozes.set(key(log.productId, log.slot), log)
  }

  const entries: DayPlanEntry[] = sources
    .filter((s) => isOnPlanDate(s, planDate))
    .map((s) => {
      const plannedTime =
        s.customTime ??
        (s.mealOffset === null ? slotTimes[s.slot] : prescriptionSlotTime(s.slot, s.mealOffset, settings))
      const { time, scheduledAt, waitingFor } = resolveTiming(s, plannedTime, planDate, settings, events)
      const final = finalLogs.get(key(s.productId, s.slot))
      const snooze = lastSnoozes.get(key(s.productId, s.slot))
      return {
        productId: s.productId,
        productName: s.productName,
        kind: s.kind,
        slot: s.slot,
        dose: s.dose,
        time,
        scheduledAt,
        waitingFor,
        status: final ? (final.action as CheckAction) : 'pending',
        actedAt: final?.actedAt ?? null,
        snoozedUntil: snooze
          ? new Date(Date.parse(snooze.actedAt) + settings.snoozeMinutes * MINUTE_MS).toISOString()
          : null,
        addedAt: s.addedAt
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

  const afterMealMinutes = parseInteger(input.afterMealMinutes, '식후 알람', 0, 180, '분', errors)
  const beforeBedMinutes = parseInteger(input.beforeBedMinutes, '취침 전 알람', 0, 180, '분', errors)
  const snoozeMinutes = parseInteger(input.snoozeMinutes, '다시 알림(스누즈)', 1, 60, '분', errors)
  const repeatIntervalMinutes = parseInteger(input.repeatIntervalMinutes, '재알림 간격', 1, 30, '분', errors)
  const repeatMaxCount = parseInteger(input.repeatMaxCount, '재알림 최대 횟수', 0, 20, '회', errors)
  if (typeof input.alarmSound !== 'boolean') errors.push('알람 소리 설정이 올바르지 않습니다')
  if (typeof input.autoLaunch !== 'boolean') errors.push('자동 실행 설정이 올바르지 않습니다')
  const eventFallbackMinutes = parseInteger(input.eventFallbackMinutes, '기록이 없을 때 알림', 15, 240, '분', errors)
  const eventModes = {} as Record<LifeEvent, EventMode>
  const rawModes = (typeof input.eventModes === 'object' && input.eventModes !== null ? input.eventModes : {}) as Record<
    string,
    unknown
  >
  for (const event of LIFE_EVENTS) eventModes[event] = rawModes[event] === 'fixed' ? 'fixed' : 'click'
  if (!LIFE_EVENTS.every((e) => rawModes[e] === 'fixed' || rawModes[e] === 'click')) {
    errors.push('생활 기록 방식 설정이 올바르지 않습니다')
  }

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
      slotOverrides,
      alarmSound: input.alarmSound as boolean,
      snoozeMinutes,
      repeatIntervalMinutes,
      repeatMaxCount,
      autoLaunch: input.autoLaunch as boolean,
      eventModes,
      eventFallbackMinutes
    }
  }
}

/** min~max 정수 검사. 화면에서 온 문자열 숫자도 받는다 */
function parseInteger(
  value: unknown,
  label: string,
  min: number,
  max: number,
  unit: string,
  errors: string[]
): number {
  const n = typeof value === 'string' && value.trim() !== '' ? Number(value) : value
  if (typeof n !== 'number' || !Number.isInteger(n) || n < min || n > max) {
    errors.push(`${label}: ${min}~${max}${unit} 사이의 정수로 입력해 주세요`)
    return min
  }
  return n
}
