// 알람 판단 (순수 함수). 스케줄러가 30초마다 부르고, 팝업 화면은 "N분 지남" 문구에 쓴다.
import type { AlarmItem, DayPlanEntry, Settings } from './types'

const MINUTE_MS = 60_000

/**
 * 지금 울려야 하는 항목: 대기 중 + 예정 시각이 지남 + 스누즈 중이 아님
 * + 등록하기 전에 이미 지난 시각이 아님 (예: 오후에 아침 약을 등록하면 그 아침 알람은 울리지 않는다).
 */
export function dueEntries(entries: DayPlanEntry[], now: Date): DayPlanEntry[] {
  const t = now.getTime()
  return entries.filter((e) => {
    const scheduled = Date.parse(e.scheduledAt)
    return (
      e.status === 'pending' &&
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
    scheduledAt: entry.scheduledAt
  }
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
