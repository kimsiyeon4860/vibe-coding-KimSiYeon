// 생활 기록(기상·식사·취침) 저장·조회. 복용일마다 사건당 하나 (다시 기록하면 바뀐다).
import type { DatabaseSync } from 'node:sqlite'
import type { DayEvents, LifeEvent } from '../../shared/types'

export function listDayEvents(db: DatabaseSync, planDate: string): DayEvents {
  const rows = db.prepare('SELECT event, at FROM life_events WHERE plan_date = ?').all(planDate) as unknown as {
    event: LifeEvent
    at: string
  }[]
  return Object.fromEntries(rows.map((r) => [r.event, r.at])) as DayEvents
}

export function saveDayEvent(db: DatabaseSync, planDate: string, event: LifeEvent, at: string): void {
  db.prepare(
    'INSERT INTO life_events (plan_date, event, at) VALUES (?, ?, ?) ON CONFLICT(plan_date, event) DO UPDATE SET at = excluded.at'
  ).run(planDate, event, at)
}

export function deleteDayEvent(db: DatabaseSync, planDate: string, event: LifeEvent): void {
  db.prepare('DELETE FROM life_events WHERE plan_date = ? AND event = ?').run(planDate, event)
}
