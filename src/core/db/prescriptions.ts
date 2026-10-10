// 처방약 저장·조회. 약 자체는 products(type='prescription'), 먹는 때는 schedule_items,
// 처방 정보(식사 기준·기간·메모)는 prescriptions에 저장한다.
import type { SqlDatabase } from './sql'
import type { MealTiming, Prescription, PrescriptionInput, ScheduleItem } from '../../shared/types'
import { loadSchedule, loadSchedules, replaceSchedule } from './scheduleItems'
import { withTransaction } from './transaction'

interface PrescriptionRow {
  id: number
  name: string
  active: number
  created_at: string
  meal_timing: MealTiming
  meal_offset_minutes: number
  start_date: string
  days: number | null
  memo: string
}

const SELECT = `
  SELECT p.id, p.name, p.active, p.created_at,
         rx.meal_timing, rx.meal_offset_minutes, rx.start_date, rx.days, rx.memo
  FROM products p JOIN prescriptions rx ON rx.product_id = p.id
  WHERE p.type = 'prescription'`

/** 처방약 전체 (시작일 최근 것부터) */
export function listPrescriptions(db: SqlDatabase): Prescription[] {
  const rows = db.prepare(`${SELECT} ORDER BY rx.start_date DESC, p.id DESC`).all() as unknown as PrescriptionRow[]
  const scheduleOf = loadSchedules(db, 'prescription')
  return rows.map((r) => toPrescription(r, scheduleOf.get(r.id) ?? []))
}

export function getPrescription(db: SqlDatabase, id: number): Prescription | null {
  const row = db.prepare(`${SELECT} AND p.id = ?`).get(id) as unknown as PrescriptionRow | undefined
  return row ? toPrescription(row, loadSchedule(db, id)) : null
}

export function createPrescription(db: SqlDatabase, input: PrescriptionInput, now: Date = new Date()): Prescription {
  const id = withTransaction(db, () => {
    const result = db
      .prepare(`INSERT INTO products (type, name, source, active, created_at) VALUES ('prescription', ?, 'manual', 1, ?)`)
      .run(input.name, now.toISOString())
    const productId = Number(result.lastInsertRowid)
    db.prepare(
      `INSERT INTO prescriptions (product_id, meal_timing, meal_offset_minutes, start_date, days, memo)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).run(productId, input.mealTiming, input.mealOffsetMinutes, input.startDate, input.days, input.memo)
    replaceSchedule(db, productId, input.schedule, now)
    return productId
  })
  return getPrescription(db, id)!
}

/** 수정. 없는 id면 null. 복용 기록은 그대로 남는다 */
export function updatePrescription(
  db: SqlDatabase,
  id: number,
  input: PrescriptionInput,
  now: Date = new Date()
): Prescription | null {
  const updated = withTransaction(db, () => {
    const result = db
      .prepare(`UPDATE products SET name = ? WHERE id = ? AND type = 'prescription'`)
      .run(input.name, id)
    if (result.changes === 0) return false
    db.prepare(
      `UPDATE prescriptions SET meal_timing = ?, meal_offset_minutes = ?, start_date = ?, days = ?, memo = ?
       WHERE product_id = ?`
    ).run(input.mealTiming, input.mealOffsetMinutes, input.startDate, input.days, input.memo, id)
    replaceSchedule(db, id, input.schedule, now)
    return true
  })
  return updated ? getPrescription(db, id) : null
}

/** false = 복용 종료 (알람이 멈추고 '복용 완료'로), true = 다시 복용 */
export function setPrescriptionActive(db: SqlDatabase, id: number, active: boolean): void {
  db.prepare(`UPDATE products SET active = ? WHERE id = ? AND type = 'prescription'`).run(active ? 1 : 0, id)
}

/** 완전히 삭제. 처방 정보·먹는 때·복용 기록은 외래키로 함께 지워진다 */
export function deletePrescription(db: SqlDatabase, id: number): void {
  db.prepare(`DELETE FROM products WHERE id = ? AND type = 'prescription'`).run(id)
}

function toPrescription(row: PrescriptionRow, schedule: ScheduleItem[]): Prescription {
  return {
    id: row.id,
    name: row.name,
    active: row.active === 1,
    createdAt: row.created_at,
    mealTiming: row.meal_timing,
    mealOffsetMinutes: row.meal_offset_minutes,
    startDate: row.start_date,
    days: row.days,
    memo: row.memo,
    schedule
  }
}
