// 알람 판단 (순수 함수). 스케줄러가 30초마다 부르고, 팝업 화면은 "N분 지남" 문구에 쓴다.
import {
  MEAL_EVENTS,
  SLOT_LABELS,
  type AlarmItem,
  type DayEvents,
  type DayPlanEntry,
  type MealEvent,
  type Settings
} from './types'

const isMealEvent = (event: string | null): event is MealEvent => MEAL_EVENTS.includes(event as MealEvent)

const MINUTE_MS = 60_000

/**
 * 지금 울려야 하는 항목: 대기 중 + 예정 시각이 지남 + 스누즈 중이 아님
 * + 등록하기 전에 이미 지난 시각이 아님 (예: 오후에 아침 약을 등록하면 그 아침 알람은 울리지 않는다)
 * + 식사 기록을 기다리는 중이 아님 (그때는 알람 대신 "드셨어요?"를 묻는다 — pendingMealQuestions)
 * + 거른 식사의 영양제를 옮길 곳이 없어 오늘은 알리지 않기로 한 것이 아님.
 */
export function dueEntries(entries: DayPlanEntry[], now: Date): DayPlanEntry[] {
  const t = now.getTime()
  return entries.filter((e) => {
    const scheduled = Date.parse(e.scheduledAt)
    return (
      e.status === 'pending' &&
      !isMealEvent(e.waitingFor) &&
      e.mealSkip !== 'dropped' &&
      scheduled <= t &&
      scheduled >= Date.parse(e.addedAt) &&
      !(e.snoozedUntil !== null && Date.parse(e.snoozedUntil) > t)
    )
  })
}

export function alarmItemKey(planDate: string, entry: Pick<DayPlanEntry, 'productId' | 'slot'>): string {
  return `${planDate}|${entry.productId}|${entry.slot}`
}

export function toAlarmItem(planDate: string, entry: DayPlanEntry): AlarmItem {
  return {
    key: alarmItemKey(planDate, entry),
    planDate,
    productId: entry.productId,
    slot: entry.slot,
    productName: entry.productName,
    kind: entry.kind,
    dose: entry.dose,
    time: entry.time,
    scheduledAt: entry.scheduledAt,
    ...(mealSkipNote(entry) ? { note: mealSkipNote(entry)! } : {})
  }
}

/** 거른 식사 때문에 바뀐 알람에 붙일 안내 */
export function mealSkipNote(entry: Pick<DayPlanEntry, 'slot' | 'mealSkip' | 'carriedTo'>): string | null {
  const meal = SLOT_LABELS[entry.slot].replace(/ 식후$/, '')
  if (entry.mealSkip === 'prescription') {
    return `${meal}을 걸렀어요. 식사를 거른 날 이 약을 어떻게 드실지는 처방 약사의 지시를 따르세요.`
  }
  if (entry.mealSkip === 'carried' && entry.carriedTo) {
    return `${meal}을 걸러 ${SLOT_LABELS[entry.carriedTo]}에 함께 알려 드려요.`
  }
  return null
}

/**
 * 지금 "○○ 드셨어요?"를 물어야 하는 식사 (시간순). 클릭 기록 모드에서 그 식사를 기다리는 항목이 있고,
 * 평소 식사 시간 + 대기 시간이 지났는데 기록도 거름도 없을 때만. 항목이 없는 식사는 묻지 않는다.
 * 등록하기 전에 이미 지난 식사도 묻지 않는다 (오후에 아침 영양제를 등록한 날).
 */
export function pendingMealQuestions(
  entries: DayPlanEntry[],
  events: DayEvents,
  skips: DayEvents,
  settings: Pick<Settings, 'eventModes'>,
  now: Date
): MealEvent[] {
  const t = now.getTime()
  return MEAL_EVENTS.filter(
    (meal) =>
      settings.eventModes[meal] === 'click' &&
      !events[meal] &&
      !skips[meal] &&
      entries.some(
        (e) =>
          e.status === 'pending' &&
          e.waitingFor === meal &&
          Date.parse(e.scheduledAt) <= t &&
          Date.parse(e.scheduledAt) >= Date.parse(e.addedAt)
      )
  )
}

/** 지금 떠 있는 알람의 울림 상태 */
export interface RingState {
  /** 팝업에 있는 항목 key */
  keys: string[]
  /** 지금까지 울린 횟수 (첫 알림 포함) */
  ringCount: number
  /** 마지막으로 울린 시각 (ms) */
  lastRingAt: number
}

/**
 * 이번 확인에서 울릴지 정한다.
 * - 새 항목이 생기면 바로 울리고 횟수를 처음부터 센다.
 * - 같은 항목이 계속 남아 있으면 재알림 간격마다 울린다. 최대 횟수를 넘으면 소리 없이 팝업만 남는다.
 * - 울릴 항목이 없으면 상태를 지운다 (팝업 닫힘).
 */
export function decideRing(
  prev: RingState | null,
  dueKeys: string[],
  now: Date,
  settings: Pick<Settings, 'repeatIntervalMinutes' | 'repeatMaxCount'>
): { ring: boolean; state: RingState | null } {
  if (dueKeys.length === 0) return { ring: false, state: null }
  const t = now.getTime()

  const hasNew = prev === null || dueKeys.some((k) => !prev.keys.includes(k))
  if (hasNew) return { ring: true, state: { keys: dueKeys, ringCount: 1, lastRingAt: t } }

  const repeatDue =
    prev.ringCount <= settings.repeatMaxCount && t - prev.lastRingAt >= settings.repeatIntervalMinutes * MINUTE_MS
  if (repeatDue) return { ring: true, state: { keys: dueKeys, ringCount: prev.ringCount + 1, lastRingAt: t } }

  return { ring: false, state: { ...prev, keys: dueKeys } }
}

/** "25분 지남", "3시간 지남", "1시간 5분 지남". 1분이 안 지났으면 빈 문자열 */
export function overdueLabel(scheduledAt: string, now: Date): string {
  const minutes = Math.floor((now.getTime() - Date.parse(scheduledAt)) / MINUTE_MS)
  if (minutes < 1) return ''
  if (minutes < 60) return `${minutes}분 지남`
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return m === 0 ? `${h}시간 지남` : `${h}시간 ${m}분 지남`
}
