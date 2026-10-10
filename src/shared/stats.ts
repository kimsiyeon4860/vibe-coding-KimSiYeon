// 복용 기록 통계 (순수 함수). '기록 없음 = 놓침'으로 계산한다 (3-2단계 결정).
// 한계: 과거 계획은 '현재 일정'으로 다시 만든다. 일정에서 빠진 시점·사용 중지한 영양제는
// 기록이 있으면 세지만, 기록 없이 지나간 것은 놓침으로 잡히지 않는다 (화면에 '참고 통계'로 표시).
import type { DayPlanEntry, ProductKind, Slot } from './types'

export type Outcome = 'taken' | 'skipped' | 'missed'

/** 통계에 들어가는 복용 한 번 */
export interface StatEntry {
  planDate: string
  productId: number
  productName: string
  kind: ProductKind
  slot: Slot
  outcome: Outcome
}

/** 현재 일정에는 없지만 그날 먹음/건너뜀 기록이 있는 항목 */
export interface LoggedOutcome {
  productId: number
  productName: string
  kind: ProductKind
  slot: Slot
  action: 'taken' | 'skipped'
}

export interface DayStats {
  planDate: string
  taken: number
  skipped: number
  missed: number
  /** 아직 예정 시각이 안 된 항목 (오늘만) */
  upcoming: number
}

export interface ProductStats {
  productId: number
  productName: string
  kind: ProductKind
  taken: number
  skipped: number
  missed: number
  /** 먹음 ÷ 전체. 셀 것이 없으면 null */
  rate: number | null
}

export interface StatsView {
  /** 오래된 날부터 */
  days: DayStats[]
  taken: number
  skipped: number
  missed: number
  rate: number | null
  /** 그날 먹을 것을 모두 먹은 날이 이어진 수 (오늘이 진행 중이면 어제부터 센다) */
  streak: number
  /** 복용률 낮은 순 */
  products: ProductStats[]
}

/**
 * 복용일 하루를 통계용으로 정리한다.
 * - 먹음·건너뜀 기록이 있으면 그대로
 * - 대기 중인데 예정 시각이 지났으면 놓침. 단, 등록하기 전 시각이면 세지 않는다
 * - 예정 시각이 아직 안 됐으면 upcoming (세지 않음)
 */
export function summarizeDay(
  planDate: string,
  plan: DayPlanEntry[],
  extraLogs: LoggedOutcome[],
  now: Date
): { entries: StatEntry[]; upcoming: number } {
  const t = now.getTime()
  const entries: StatEntry[] = []
  let upcoming = 0

  for (const e of plan) {
    const base = { planDate, productId: e.productId, productName: e.productName, kind: e.kind, slot: e.slot }
    if (e.status !== 'pending') {
      entries.push({ ...base, outcome: e.status })
      continue
    }
    const scheduled = Date.parse(e.scheduledAt)
    if (scheduled < Date.parse(e.addedAt)) continue
    if (scheduled > t) upcoming++
    else entries.push({ ...base, outcome: 'missed' })
  }

  const planned = new Set(plan.map((e) => `${e.productId}:${e.slot}`))
  for (const log of extraLogs) {
    if (planned.has(`${log.productId}:${log.slot}`)) continue
    entries.push({
      planDate,
      productId: log.productId,
      productName: log.productName,
      kind: log.kind,
      slot: log.slot,
      outcome: log.action
    })
  }
  return { entries, upcoming }
}

/**
 * @param days 오래된 날부터. 마지막이 오늘(진행 중인 복용일)
 * @param streakDays 연속 완료일 계산용 (보통 기간보다 길게, 오래된 날부터, 마지막이 오늘)
 */
export function buildStats(
  days: { planDate: string; entries: StatEntry[]; upcoming: number }[],
  streakDays: { entries: StatEntry[]; upcoming: number }[] = days
): StatsView {
  const dayStats = days.map(({ planDate, entries, upcoming }) => ({ planDate, ...count(entries), upcoming }))
  const all = days.flatMap((d) => d.entries)
  const total = count(all)

  const byProduct = new Map<number, StatEntry[]>()
  for (const e of all) byProduct.set(e.productId, [...(byProduct.get(e.productId) ?? []), e])
  const products = [...byProduct.values()]
    .map((list) => {
      const c = count(list)
      return {
        productId: list[0].productId,
        productName: list[list.length - 1].productName,
        kind: list[0].kind,
        ...c,
        rate: rateOf(c)
      }
    })
    .sort((a, b) => (a.rate ?? 1) - (b.rate ?? 1) || a.productName.localeCompare(b.productName, 'ko'))

  return { days: dayStats, ...total, rate: rateOf(total), streak: streakOf(streakDays), products }
}

function count(entries: StatEntry[]): { taken: number; skipped: number; missed: number } {
  return {
    taken: entries.filter((e) => e.outcome === 'taken').length,
    skipped: entries.filter((e) => e.outcome === 'skipped').length,
    missed: entries.filter((e) => e.outcome === 'missed').length
  }
}

function rateOf({ taken, skipped, missed }: { taken: number; skipped: number; missed: number }): number | null {
  const total = taken + skipped + missed
  return total === 0 ? null : taken / total
}

/**
 * 연속 완료일. 먹을 것이 없던 날은 건너뛰고(끊지 않음), 하나라도 놓치거나 건너뛰면 끊긴다.
 * 오늘: 놓치거나 건너뛴 게 있으면 0, 아직 남은 게 있으면 세지 않고 어제부터, 다 먹었으면 포함.
 */
function streakOf(days: { entries: StatEntry[]; upcoming: number }[]): number {
  let streak = 0
  for (let i = days.length - 1; i >= 0; i--) {
    const { entries, upcoming } = days[i]
    const c = count(entries)
    if (c.missed > 0 || c.skipped > 0) break
    const isToday = i === days.length - 1
    if (c.taken === 0 || (isToday && upcoming > 0)) continue
    streak++
  }
  return streak
}
