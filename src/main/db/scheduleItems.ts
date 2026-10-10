// 복용 시점(schedule_items) 저장·조회. 영양제와 처방약이 함께 쓴다.
import type { DatabaseSync } from 'node:sqlite'
import { prescriptionEndDate } from '../../shared/prescription'
import type { ScheduleSource } from '../../shared/schedule'
import { SLOTS, type MealTiming, type ProductKind, type ScheduleItem, type Slot } from '../../shared/types'

interface ScheduleRow {
  product_id: number
  slot: Slot
  custom_time: string | null
  dose: string
}

/** 제품들의 복용 시점 (제품 id → 슬롯 순서 목록) */
export function loadSchedules(db: DatabaseSync, type: ProductKind): Map<number, ScheduleItem[]> {
  const rows = db
    .prepare(
      `SELECT s.product_id, s.slot, s.custom_time, s.dose FROM schedule_items s
       JOIN products p ON p.id = s.product_id
       WHERE p.type = ?`
    )
    .all(type) as unknown as ScheduleRow[]
  const result = new Map<number, ScheduleItem[]>()
  for (const row of rows) {
    const list = result.get(row.product_id) ?? []
    list.push({ slot: row.slot, customTime: row.custom_time, dose: row.dose })
    result.set(row.product_id, list)
  }
  for (const list of result.values()) list.sort((a, b) => SLOTS.indexOf(a.slot) - SLOTS.indexOf(b.slot))
  return result
}

export function loadSchedule(db: DatabaseSync, productId: number): ScheduleItem[] {
  const rows = db
    .prepare('SELECT product_id, slot, custom_time, dose FROM schedule_items WHERE product_id = ?')
    .all(productId) as unknown as ScheduleRow[]
  return rows
    .map((r) => ({ slot: r.slot, customTime: r.custom_time, dose: r.dose }))
    .sort((a, b) => SLOTS.indexOf(a.slot) - SLOTS.indexOf(b.slot))
}

/**
 * 복용 시점을 새 목록으로 바꾼다. 원래 있던 슬롯은 등록 시각을 유지하고, 새 슬롯만 now로 기록한다
 * (그래야 이름만 고쳐도 오늘 이미 지난 알람이 조용해지지 않는다). 트랜잭션 안에서 부를 것.
 */
export function replaceSchedule(db: DatabaseSync, productId: number, schedule: ScheduleItem[], now: Date): void {
  const existing = db
    .prepare('SELECT slot, created_at FROM schedule_items WHERE product_id = ?')
    .all(productId) as unknown as { slot: Slot; created_at: string }[]
  const createdAt = new Map(existing.map((r) => [r.slot, r.created_at]))

  db.prepare('DELETE FROM schedule_items WHERE product_id = ?').run(productId)
  const insert = db.prepare(
    'INSERT INTO schedule_items (product_id, slot, custom_time, dose, created_at) VALUES (?, ?, ?, ?, ?)'
  )
  for (const item of schedule) {
    insert.run(productId, item.slot, item.customTime, item.dose, createdAt.get(item.slot) ?? now.toISOString())
  }
}

/** 오늘 계획을 만들 재료: 영양제·처방약 × 복용 시점 (사용 중지·처방 기간 포함) */
export function listScheduleSources(db: DatabaseSync): ScheduleSource[] {
  const rows = db
    .prepare(
      `SELECT p.id AS productId, p.name AS productName, p.type AS kind, p.active,
              s.slot, s.custom_time AS customTime, s.dose, s.created_at AS addedAt,
              rx.meal_timing AS mealTiming, rx.meal_offset_minutes AS mealOffsetMinutes,
              rx.start_date AS startDate, rx.days
       FROM schedule_items s
       JOIN products p ON p.id = s.product_id
       LEFT JOIN prescriptions rx ON rx.product_id = p.id`
    )
    .all() as unknown as (Omit<ScheduleSource, 'active' | 'mealOffset' | 'endDate'> & {
    active: number
    mealTiming: MealTiming | null
    mealOffsetMinutes: number | null
    days: number | null
  })[]

  return rows.map(({ mealTiming, mealOffsetMinutes, days, ...r }) => {
    const isPrescription = r.kind === 'prescription' && mealTiming !== null && r.startDate !== null
    return {
      ...r,
      active: r.active === 1,
      mealOffset: isPrescription ? (mealTiming === 'before' ? -1 : 1) * (mealOffsetMinutes ?? 0) : null,
      startDate: isPrescription ? r.startDate : null,
      endDate: isPrescription ? prescriptionEndDate({ startDate: r.startDate!, days }) : null
    }
  })
}
