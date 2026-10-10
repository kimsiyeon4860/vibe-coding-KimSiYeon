// 복용 시점 추천·충돌 찾기 (순수 함수). 영양제에만 쓴다 — 처방약은 처방전 지시가 최우선이라 추천하지 않는다.
// 우선순위: 제품 라벨 > 규칙 파일 > (규칙 없음: 사용자가 직접)
import { matchIngredients, RULES, type ConflictRule, type IngredientRule, type RulesFile } from './rules'
import { computeSlotTimes, dayBoundary, parseHm } from './schedule'
import { SLOTS, type Hm, type ScheduleItem, type Settings, type Slot, type Supplement } from './types'

const MEAL_SLOTS: readonly Slot[] = ['breakfast', 'lunch', 'dinner']

// ---------------------------------------------------------------- 성분 인식

/** 영양제가 가진 규칙 성분. 성분 목록에서 못 찾으면 제품 이름으로 찾는다 */
export function rulesOf(supplement: Pick<Supplement, 'name' | 'ingredients'>, rules: RulesFile = RULES): IngredientRule[] {
  const found = new Map<string, IngredientRule>()
  for (const ing of supplement.ingredients) {
    for (const rule of matchIngredients(ing.name, rules)) found.set(rule.id, rule)
  }
  if (found.size === 0) for (const rule of matchIngredients(supplement.name, rules)) found.set(rule.id, rule)
  // 규칙 파일 순서로
  return rules.ingredients.filter((r) => found.has(r.id))
}

// ---------------------------------------------------------------- 라벨 해석

export interface LabelHint {
  /** 라벨이 정한 시점 (없으면 null) */
  slots: Slot[] | null
  /** '식후'만 있고 언제인지는 없음 → 식사 시점 중에서 고른다 */
  mealOnly: boolean
  /** 라벨에서 시점 정보를 읽어 냈는지 */
  understood: boolean
}

/** 제품 라벨 섭취 방법에서 시점을 읽는다 (예: "1일 2회 식후", "취침 전 1캡슐", "공복에 섭취") */
export function parseLabelInstruction(text: string): LabelHint {
  const t = text.replace(/\s+/g, '')
  const none: LabelHint = { slots: null, mealOnly: false, understood: false }
  if (!t) return none

  const explicit = new Set<Slot>()
  if (/공복|기상직후|일어나자마자/.test(t)) explicit.add('wake')
  if (/아침/.test(t)) explicit.add('breakfast')
  if (/점심/.test(t)) explicit.add('lunch')
  if (/저녁/.test(t)) explicit.add('dinner')
  if (/취침|자기전|잠자기전|잠들기전/.test(t)) explicit.add('bedtime')
  if (explicit.size > 0) return { slots: SLOTS.filter((s) => explicit.has(s)), mealOnly: false, understood: true }

  const times = /(?:1일|하루)([1-3])(?:회|번)/.exec(t)
  const count = times ? Number(times[1]) : 1
  if (count === 2) return { slots: ['breakfast', 'dinner'], mealOnly: false, understood: true }
  if (count === 3) return { slots: ['breakfast', 'lunch', 'dinner'], mealOnly: false, understood: true }

  if (/식후|식사후|식사와함께|식사중|식사직후|식사시|식사때/.test(t)) {
    return { slots: null, mealOnly: true, understood: true }
  }
  return none
}

// ---------------------------------------------------------------- 충돌

/** 하루 일정에 놓인 영양제 한 번 복용 */
export interface PlacedDose {
  productId: number
  productName: string
  ingredientIds: string[]
  slot: Slot
  time: Hm
}

export interface ConflictWarning {
  a: PlacedDose
  b: PlacedDose
  /** 실제 간격 (분) */
  gapMinutes: number
  rule: ConflictRule
}

/** 영양제들을 정해진 슬롯에 놓았을 때의 복용 목록. 원래 일정과 같은 슬롯이면 직접 지정 시간을 유지한다 */
export function placeDoses(
  placements: { supplement: Supplement; slots: Slot[] }[],
  settings: Settings,
  rules: RulesFile = RULES
): PlacedDose[] {
  const slotTimes = computeSlotTimes(settings)
  return placements.flatMap(({ supplement, slots }) => {
    const ingredientIds = rulesOf(supplement, rules).map((r) => r.id)
    return slots.map((slot) => ({
      productId: supplement.id,
      productName: supplement.name,
      ingredientIds,
      slot,
      time: supplement.schedule.find((item) => item.slot === slot)?.customTime ?? slotTimes[slot]
    }))
  })
}

/** 함께 먹으면 안 좋은 조합이 너무 가까이 놓였는지. 같은 영양제끼리는 보지 않는다 */
export function findConflicts(doses: PlacedDose[], settings: Settings, rules: RulesFile = RULES): ConflictWarning[] {
  const boundary = dayBoundary(settings)
  // 복용일 경계 기준 분 → 자정을 넘는 시간도 올바르게 비교
  const rel = (time: Hm) => ((parseHm(time) ?? 0) - boundary + 24 * 60) % (24 * 60)

  const best = new Map<string, ConflictWarning>()
  for (let i = 0; i < doses.length; i++) {
    for (let j = i + 1; j < doses.length; j++) {
      const [a, b] = [doses[i], doses[j]]
      if (a.productId === b.productId) continue
      for (const rule of rules.conflicts) {
        const matches =
          (a.ingredientIds.includes(rule.a) && b.ingredientIds.includes(rule.b)) ||
          (a.ingredientIds.includes(rule.b) && b.ingredientIds.includes(rule.a))
        if (!matches) continue
        const gap = Math.abs(rel(a.time) - rel(b.time))
        if (gap >= rule.minGapMinutes) continue
        const [first, second] = a.productId < b.productId ? [a, b] : [b, a]
        const key = `${first.productId}|${second.productId}|${rule.a}|${rule.b}`
        const prev = best.get(key)
        if (!prev || gap < prev.gapMinutes) best.set(key, { a: first, b: second, gapMinutes: gap, rule })
      }
    }
  }
  return [...best.values()]
}

// ---------------------------------------------------------------- 추천

/** 추천 근거: 라벨 / 규칙 파일 / 규칙 없음 (사용자가 직접) */
export type RecommendationBasis = 'label' | 'rule' | 'none'

export interface Recommendation {
  productId: number
  productName: string
  slots: Slot[]
  basis: RecommendationBasis
  /** 화면에 보여줄 이유 (한 줄씩) */
  reasons: string[]
  /** 근거가 약한 규칙이 섞였는지 → '근거 약함' 표시 */
  evidenceLimited: boolean
  /** 라벨 문구가 있는데 해석하지 못했을 때 원문 */
  unreadLabel: string | null
}

interface Draft {
  supplement: Supplement
  recommendation: Recommendation
  /** 충돌을 피해 옮길 수 있는 후보 (null이면 고정) */
  candidates: Slot[] | null
  /** 충돌 규칙에 걸리는 성분이 있으면 먼저 자리를 잡는다 (철분 → 칼슘 등) */
  priority: number
}

/**
 * 사용 중인 영양제마다 복용 시점을 추천한다.
 * - 라벨이 시점을 정했으면 그대로 (basis 'label')
 * - 규칙이 있으면 모든 성분 규칙의 순서를 합쳐 고르고, 이미 놓인 영양제와 충돌하면 다음 후보로 (basis 'rule')
 * - 규칙이 없으면 현재 일정을 그대로 두고 직접 정하게 한다 (basis 'none')
 */
export function recommend(supplements: Supplement[], settings: Settings, rules: RulesFile = RULES): Recommendation[] {
  const drafts = supplements.filter((s) => s.active).map((s) => draftFor(s, rules))

  const placed: { supplement: Supplement; slots: Slot[] }[] = []
  const conflictsWith = (supplement: Supplement, slots: Slot[]) =>
    findConflicts(placeDoses([...placed, { supplement, slots }], settings, rules), settings, rules).some(
      (c) => c.a.productId === supplement.id || c.b.productId === supplement.id
    )

  // 고정된 것 먼저, 그다음 충돌 규칙에 걸리는 성분이 많은 것부터
  const order = [...drafts].sort(
    (x, y) => Number(x.candidates !== null) - Number(y.candidates !== null) || y.priority - x.priority
  )
  for (const d of order) {
    if (d.candidates !== null && d.candidates.length > 0) {
      const choice = d.candidates.find((slot) => !conflictsWith(d.supplement, [slot])) ?? d.candidates[0]
      d.recommendation.slots = [choice]
    }
    placed.push({ supplement: d.supplement, slots: d.recommendation.slots })
  }
  return drafts.map((d) => d.recommendation)
}

function draftFor(supplement: Supplement, rules: RulesFile): Draft {
  const matched = rulesOf(supplement, rules)
  const label = parseLabelInstruction(supplement.labelInstruction)
  const conflictIds = new Set(rules.conflicts.flatMap((c) => [c.a, c.b]))
  const priority =
    matched.filter((r) => conflictIds.has(r.id)).length + (matched.some((r) => rules.conflicts.some((c) => c.a === r.id)) ? 10 : 0)
  const base = {
    productId: supplement.id,
    productName: supplement.name,
    evidenceLimited: matched.some((r) => r.evidence === 'limited'),
    unreadLabel: supplement.labelInstruction && !label.understood ? supplement.labelInstruction : null
  }
  const ruleReasons = [...new Set(matched.map((r) => `${r.name}: ${r.reason}`))]

  // 1) 라벨이 시점을 정함
  if (label.slots) {
    return {
      supplement,
      priority,
      candidates: null,
      recommendation: {
        ...base,
        slots: label.slots,
        basis: 'label',
        reasons: [`라벨: ${supplement.labelInstruction}`],
        evidenceLimited: false
      }
    }
  }

  // 2) 규칙 (라벨이 '식후'라고만 했으면 식사 시점으로 좁힘)
  if (matched.length > 0) {
    let candidates = rankSlots(matched)
    if (label.mealOnly) {
      const meals = candidates.filter((s) => MEAL_SLOTS.includes(s))
      candidates = meals.length > 0 ? meals : [...MEAL_SLOTS]
    }
    return {
      supplement,
      priority,
      candidates,
      recommendation: {
        ...base,
        slots: [candidates[0]],
        basis: 'rule',
        reasons: label.mealOnly ? [`라벨: ${supplement.labelInstruction}`, ...ruleReasons] : ruleReasons
      }
    }
  }

  // 라벨이 '식후'만 말하고 규칙은 없음 → 아침 식후
  if (label.mealOnly) {
    return {
      supplement,
      priority,
      candidates: [...MEAL_SLOTS],
      recommendation: {
        ...base,
        slots: ['breakfast'],
        basis: 'label',
        reasons: [`라벨: ${supplement.labelInstruction}`],
        evidenceLimited: false
      }
    }
  }

  // 3) 규칙 없음 → 현재 일정 유지, 직접 정하기
  return {
    supplement,
    priority,
    candidates: null,
    recommendation: {
      ...base,
      slots: supplement.schedule.map((item) => item.slot),
      basis: 'none',
      reasons: ['규칙에 없는 성분이라 직접 정해 주세요']
    }
  }
}

/** 여러 성분 규칙의 추천 순서를 합친다: 모두가 허용하는 시점이 먼저, 순위 합이 작은 순 */
function rankSlots(rules: IngredientRule[]): Slot[] {
  const score = (slot: Slot) => rules.reduce((sum, r) => sum + (r.slots.includes(slot) ? r.slots.indexOf(slot) : 100), 0)
  return SLOTS.filter((slot) => rules.some((r) => r.slots.includes(slot))).sort(
    (a, b) => score(a) - score(b) || SLOTS.indexOf(a) - SLOTS.indexOf(b)
  )
}

// ---------------------------------------------------------------- 적용

/**
 * 새 슬롯 목록으로 바꿀 때의 복용 시점. 그대로인 슬롯은 복용량·직접 지정 시간을 유지하고,
 * 새 슬롯은 빠진 슬롯(없으면 첫 슬롯)의 복용량만 가져오고 직접 지정 시간은 비운다.
 */
export function rescheduleItems(current: ScheduleItem[], slots: Slot[]): ScheduleItem[] {
  const kept = new Map(current.map((item) => [item.slot, item]))
  const removed = current.filter((item) => !slots.includes(item.slot))
  let donor = 0
  return SLOTS.filter((slot) => slots.includes(slot)).map((slot) => {
    const same = kept.get(slot)
    if (same) return same
    const dose = removed[donor]?.dose ?? current[0]?.dose ?? ''
    donor++
    return { slot, customTime: null, dose }
  })
}
