// 생활 기록(기상·식사·취침)과 식사 거름 저장·조회. 복용일마다 사건당 한 행 — 기록하거나 거르거나 둘 중 하나.
import type { SqlDatabase } from './sql'
import type { DayEvents, LifeEvent, MealEvent } from '../../shared/types'

function list(db: SqlDatabase, planDate: string, skipped: 0 | 1): DayEvents {
  const rows = db
    .prepare('SELECT event, at FROM life_events WHERE plan_date = ? AND skipped = ?')
    .all(planDate, skipped) as unknown as { event: LifeEvent; at: string }[]
  return Object.fromEntries(rows.map((r) => [r.event, r.at])) as DayEvents
}

/** 그 복용일에 기록한 사건 */
export function listDayEvents(db: SqlDatabase, planDate: string): DayEvents {
  return list(db, planDate, 0)
}

/** 그 복용일에 거른 식사 */
export function listDaySkips(db: SqlDatabase, planDate: string): DayEvents {
  return list(db, planDate, 1)
}

function upsert(db: SqlDatabase, planDate: string, event: LifeEvent, at: string, skipped: 0 | 1): void {
  db.prepare(
    `INSERT INTO life_events (plan_date, event, at, skipped) VALUES (?, ?, ?, ?)
     ON CONFLICT(plan_date, event) DO UPDATE SET at = excluded.at, skipped = excluded.skipped`
  ).run(planDate, event, at, skipped)
}

/** 기록 (거름이었으면 기록으로 바뀐다) */
export function saveDayEvent(db: SqlDatabase, planDate: string, event: LifeEvent, at: string): void {
  upsert(db, planDate, event, at, 0)
}

/** 식사 거름 (기록이었으면 거름으로 바뀐다) */
export function skipDayMeal(db: SqlDatabase, planDate: string, meal: MealEvent, at: string): void {
  upsert(db, planDate, meal, at, 1)
}

/** 기록·거름 모두 지움 */
export function deleteDayEvent(db: SqlDatabase, planDate: string, event: LifeEvent): void {
  db.prepare('DELETE FROM life_events WHERE plan_date = ? AND event = ?').run(planDate, event)
}
