// 오늘 복용 목록 만들기·기록하기. 3-2단계 알람 스케줄러도 여기를 쓴다.
import type { DatabaseSync } from 'node:sqlite'
import { buildDayPlan, planDateFor } from '../shared/schedule'
import type { CheckAction, DayPlanEntry, Slot, TodayView } from '../shared/types'
import { addIntakeLog, listIntakeLogs, undoIntake } from './db/intakeLogs'
import { getSettings } from './db/settings'
import { listScheduleSources } from './db/supplements'

/** 복용일 하루의 계획 */
export function getDayPlan(db: DatabaseSync, planDate: string): DayPlanEntry[] {
  return buildDayPlan(planDate, getSettings(db), listScheduleSources(db), listIntakeLogs(db, planDate))
}

/** 지금 시각 기준 오늘 화면 */
export function getTodayView(db: DatabaseSync, now: Date = new Date()): TodayView {
  const planDate = planDateFor(now, getSettings(db))
  return { planDate, entries: getDayPlan(db, planDate) }
}

/** 먹음/건너뜀 기록. 계획에 없는 항목이면 false */
export function recordCheck(
  db: DatabaseSync,
  planDate: string,
  productId: number,
  slot: Slot,
  action: CheckAction,
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
