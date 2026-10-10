// 복용 기록 저장·조회
import type { DatabaseSync } from 'node:sqlite'
import type { IntakeLog, Slot } from '../../shared/types'

export interface NewIntakeLog extends IntakeLog {
  planDate: string
  scheduledAt: string
}

/** 그 복용일의 기록 (오래된 것부터) */
export function listIntakeLogs(db: DatabaseSync, planDate: string): IntakeLog[] {
  return db
    .prepare(
      `SELECT product_id AS productId, slot, action, acted_at AS actedAt
       FROM intake_logs WHERE plan_date = ? ORDER BY id`
    )
    .all(planDate) as unknown as IntakeLog[]
}

export function addIntakeLog(db: DatabaseSync, log: NewIntakeLog): void {
  db.prepare(
    `INSERT INTO intake_logs (product_id, slot, plan_date, scheduled_at, action, acted_at)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run(log.productId, log.slot, log.planDate, log.scheduledAt, log.action, log.actedAt)
}

/** 먹음/건너뜀 표시를 취소 (다시 '대기'로). 스누즈 기록은 남긴다 */
export function undoIntake(db: DatabaseSync, planDate: string, productId: number, slot: Slot): void {
  db.prepare(
    `DELETE FROM intake_logs
     WHERE plan_date = ? AND product_id = ? AND slot = ? AND action IN ('taken', 'skipped')`
  ).run(planDate, productId, slot)
}
