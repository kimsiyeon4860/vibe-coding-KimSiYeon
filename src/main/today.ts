// 오늘 복용 목록 만들기·기록하기. 3-2단계 알람 스케줄러도 여기를 쓴다.
import type { DatabaseSync } from 'node:sqlite'
import { addDays, format, parseISO } from 'date-fns'
import { buildDayPlan, planDateFor, scheduledAtFor } from '../shared/schedule'
import { buildStats, summarizeDay, type StatsView } from '../shared/stats'
import { LIFE_EVENTS, type AlarmAction, type DayPlanEntry, type Hm, type LifeEvent, type Slot, type TodayView } from '../shared/types'
import { addIntakeLog, listFinalOutcomes, listIntakeLogs, undoIntake } from './db/intakeLogs'
import { deleteDayEvent, listDayEvents, saveDayEvent } from './db/lifeEvents'
import { getSettings } from './db/settings'
import { listScheduleSources } from './db/scheduleItems'

/** 복용일 하루의 계획 */
export function getDayPlan(db: DatabaseSync, planDate: string): DayPlanEntry[] {
  return buildDayPlan(
    planDate,
    getSettings(db),
    listScheduleSources(db),
    listIntakeLogs(db, planDate),
    listDayEvents(db, planDate)
  )
}

/** 지금 시각 기준 오늘 화면 */
export function getTodayView(db: DatabaseSync, now: Date = new Date()): TodayView {
  const settings = getSettings(db)
  const planDate = planDateFor(now, settings)
  const entries = getDayPlan(db, planDate)
  const kinds = new Set(entries.map((e) => e.kind))
  return {
    planDate,
    entries,
    mixesPrescriptionAndSupplement: kinds.has('prescription') && kinds.has('supplement'),
    events: listDayEvents(db, planDate),
    clickEvents: LIFE_EVENTS.filter((e) => settings.eventModes[e] === 'click')
  }
}

/** 먹음/건너뜀/스누즈 기록. 계획에 없는 항목이면 false */
export function recordCheck(
  db: DatabaseSync,
  planDate: string,
  productId: number,
  slot: Slot,
  action: AlarmAction,
  now: Date = new Date()
): boolean {
  const entry = getDayPlan(db, planDate).find((e) => e.productId === productId && e.slot === slot)
  if (!entry) return false
  addIntakeLog(db, {
    productId,
    slot,
    planDate,
    scheduledAt: entry.scheduledAt,
    action,
    actedAt: now.toISOString()
  })
  return true
}

export function undoCheck(db: DatabaseSync, planDate: string, productId: number, slot: Slot): void {
  undoIntake(db, planDate, productId, slot)
}

/** 연속 완료일은 기간과 상관없이 최근 이만큼까지 거슬러 올라가 센다 */
const STREAK_LOOKBACK_DAYS = 90

/** 최근 N 복용일(오늘 포함)의 통계 */
export function getStatsView(db: DatabaseSync, days: number, now: Date = new Date()): StatsView {
  const today = planDateFor(now, getSettings(db))
  const summarize = (back: number) => {
    const planDate = format(addDays(parseISO(today), -back), 'yyyy-MM-dd')
    return { planDate, ...summarizeDay(planDate, getDayPlan(db, planDate), listFinalOutcomes(db, planDate), now) }
  }
  const range = Array.from({ length: Math.max(days, STREAK_LOOKBACK_DAYS) }, (_, i) => summarize(i)).reverse()
  return buildStats(range.slice(-days), range)
}

/** 생활 기록. time("HH:mm")을 주면 그 복용일의 그 시각, 없으면 지금 */
export function recordLifeEvent(
  db: DatabaseSync,
  planDate: string,
  event: LifeEvent,
  time?: Hm,
  now: Date = new Date()
): void {
  const at = time ? scheduledAtFor(planDate, time, getSettings(db)) : now.toISOString()
  saveDayEvent(db, planDate, event, at)
}

export function clearLifeEvent(db: DatabaseSync, planDate: string, event: LifeEvent): void {
  deleteDayEvent(db, planDate, event)
}
