// 처방약 기간·시간·입력값 (순수 함수). 처방전 지시가 최우선이므로 앱은 시점을 자동으로 바꾸지 않는다.
import { addDays, differenceInCalendarDays, format, isValid, parse } from 'date-fns'
import { prescriptionSlotTime } from './schedule'
import { NAME_MAX, INSTRUCTION_MAX, isRecord, parseSchedule, text } from './supplementInput'
import {
  MEAL_TIMING_LABELS,
  SLOT_LABELS,
  type Hm,
  type MealTiming,
  type ParseResult,
  type Prescription,
  type PrescriptionInput,
  type Settings
} from './types'

export const MEAL_OFFSET_MAX = 120
export const DAYS_MAX = 365

type Period = Pick<Prescription, 'startDate' | 'days'>

/** 마지막 복용일 "yyyy-MM-dd". 계속 복용이면 null */
export function prescriptionEndDate({ startDate, days }: Period): string | null {
  if (days === null) return null
  return format(addDays(parseDate(startDate), days - 1), 'yyyy-MM-dd')
}

/** 복용일 기준 상태: 시작 전 / 복용 중 / 복용 완료(기간 끝 또는 '복용 종료') */
export type PrescriptionStatus = 'upcoming' | 'ongoing' | 'finished'

export function prescriptionStatus(p: Period & Pick<Prescription, 'active'>, planDate: string): PrescriptionStatus {
  const end = prescriptionEndDate(p)
  if (!p.active || (end !== null && planDate > end)) return 'finished'
  if (planDate < p.startDate) return 'upcoming'
  return 'ongoing'
}

/** 시작일부터 며칠째인지 (시작일 = 1일째) */
export function prescriptionDayNumber(startDate: string, planDate: string): number {
  return differenceInCalendarDays(parseDate(planDate), parseDate(startDate)) + 1
}

/** 식사 기준 → 부호 있는 분 (식전 −N, 식후 +N) */
export function mealOffsetOf(p: Pick<Prescription, 'mealTiming' | 'mealOffsetMinutes'>): number {
  return p.mealTiming === 'before' ? -p.mealOffsetMinutes : p.mealOffsetMinutes
}

/** 먹는 때별 알람 시각 (직접 지정이 있으면 그 시각) */
export function prescriptionTimes(
  p: Pick<Prescription, 'mealTiming' | 'mealOffsetMinutes' | 'schedule'>,
  settings: Settings
): Hm[] {
  return p.schedule.map((item) => item.customTime ?? prescriptionSlotTime(item.slot, mealOffsetOf(p), settings))
}

/** "식후 30분 · 아침·점심·저녁 (하루 3회)". 0분이면 "식사 직후"/"식사 직전" */
export function describeTiming(p: Pick<Prescription, 'mealTiming' | 'mealOffsetMinutes' | 'schedule'>): string {
  const meal =
    p.mealOffsetMinutes === 0
      ? `식사 ${p.mealTiming === 'before' ? '직전' : '직후'}`
      : `${MEAL_TIMING_LABELS[p.mealTiming]} ${p.mealOffsetMinutes}분`
  const when = p.schedule.map((item) => SLOT_LABELS[item.slot].replace(/ 식후$/, '')).join('·')
  return `${meal} · ${when} (하루 ${p.schedule.length}회)`
}

/** 저장된 처방약과 비교해 복용 시점(식사 기준·먹는 때·시간)이 바뀌었는지 → 바뀌면 확인 창 */
export function timingChanged(before: Prescription, after: PrescriptionInput): boolean {
  if (before.mealTiming !== after.mealTiming || before.mealOffsetMinutes !== after.mealOffsetMinutes) return true
  const key = (items: Prescription['schedule']) => items.map((i) => `${i.slot}@${i.customTime ?? ''}`).join(',')
  return key(before.schedule) !== key(after.schedule)
}

/** 처방약 입력값 검사. IPC로 넘어온 값도 믿지 않도록 unknown으로 받는다 */
export function parsePrescriptionDraft(raw: unknown): ParseResult<PrescriptionInput> {
  if (!isRecord(raw)) return { ok: false, errors: ['입력값 형식이 올바르지 않습니다'] }
  const errors: string[] = []

  const name = text(raw.name)
  if (!name) errors.push('약 이름을 입력해 주세요')
  else if (name.length > NAME_MAX) errors.push(`약 이름은 ${NAME_MAX}자 이하로 입력해 주세요`)

  const mealTiming = raw.mealTiming
  if (mealTiming !== 'before' && mealTiming !== 'after') errors.push('식전·식후를 골라 주세요')

  const offset = Number(text(raw.mealOffsetMinutes))
  if (text(raw.mealOffsetMinutes) === '' || !Number.isInteger(offset) || offset < 0 || offset > MEAL_OFFSET_MAX) {
    errors.push(`식전·식후 시간은 0~${MEAL_OFFSET_MAX}분 사이의 정수로 입력해 주세요`)
  }

  const startDate = text(raw.startDate)
  if (!isDateString(startDate)) errors.push('시작일을 확인해 주세요')

  const daysText = text(raw.days)
  let days: number | null = null
  if (daysText) {
    days = Number(daysText)
    if (!Number.isInteger(days) || days < 1 || days > DAYS_MAX) {
      errors.push(`처방 일수는 1~${DAYS_MAX}일 사이의 정수로 입력해 주세요 (계속 복용이면 비워 두세요)`)
    }
  }

  const memo = text(raw.memo)
  if (memo.length > INSTRUCTION_MAX) errors.push(`메모는 ${INSTRUCTION_MAX}자 이하로 입력해 주세요`)

  const schedule = parseSchedule(raw.schedule, errors)
  if (schedule.length === 0) errors.push('먹는 때를 하나 이상 골라 주세요')

  if (errors.length > 0) return { ok: false, errors }
  return {
    ok: true,
    value: {
      name,
      mealTiming: mealTiming as MealTiming,
      mealOffsetMinutes: offset,
      startDate,
      days,
      memo,
      schedule
    }
  }
}

function parseDate(value: string): Date {
  return parse(value, 'yyyy-MM-dd', new Date(2000, 0, 1))
}

/** 실제로 있는 날짜인 "yyyy-MM-dd"인지 (2026-02-30 같은 값은 거부) */
function isDateString(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const date = parseDate(value)
  return isValid(date) && format(date, 'yyyy-MM-dd') === value
}
