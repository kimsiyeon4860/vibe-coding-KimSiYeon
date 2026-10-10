// 복용 기록 저장·조회
import type { SqlDatabase } from './sql'
import type { LoggedOutcome } from '../../shared/stats'
import type { IntakeLog, ProductKind, Slot } from '../../shared/types'

export interface NewIntakeLog extends IntakeLog {
  planDate: string
  scheduledAt: string
}

/** 그 복용일의 기록 (오래된 것부터) */
export function listIntakeLogs(db: SqlDatabase, planDate: string): IntakeLog[] {
  return db
    .prepare(
      `SELECT product_id AS productId, slot, action, acted_at AS actedAt
       FROM intake_logs WHERE plan_date = ? ORDER BY id`
    )
    .all(planDate) as unknown as IntakeLog[]
}

/** 그 복용일에 먹음/건너뜀으로 끝난 항목 (같은 항목은 마지막 기록), 제품 이름·종류 포함 — 통계용 */
export function listFinalOutcomes(db: SqlDatabase, planDate: string): LoggedOutcome[] {
  const rows = db
    .prepare(
      `SELECT l.product_id AS productId, p.name AS productName, p.type AS kind, l.slot, l.action
       FROM intake_logs l JOIN products p ON p.id = l.product_id
       WHERE l.plan_date = ? AND l.action IN ('taken', 'skipped')
       ORDER BY l.id`
    )
    .all(planDate) as unknown as (LoggedOutcome & { kind: ProductKind })[]
  const last = new Map<string, LoggedOutcome>()
  for (const row of rows) last.set(`${row.productId}:${row.slot}`, { ...row })
  return [...last.values()]
}

export function addIntakeLog(db: SqlDatabase, log: NewIntakeLog): void {
  db.prepare(
    `INSERT INTO intake_logs (product_id, slot, plan_date, scheduled_at, action, acted_at)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run(log.productId, log.slot, log.planDate, log.scheduledAt, log.action, log.actedAt)
}

/** 먹음/건너뜀 표시를 취소 (다시 '대기'로). 스누즈 기록은 남긴다 */
export function undoIntake(db: SqlDatabase, planDate: string, productId: number, slot: Slot): void {
  db.prepare(
    `DELETE FROM intake_logs
     WHERE plan_date = ? AND product_id = ? AND slot = ? AND action IN ('taken', 'skipped')`
  ).run(planDate, productId, slot)
}
