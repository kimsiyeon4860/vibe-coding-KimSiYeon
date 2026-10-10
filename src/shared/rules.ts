// 복용 시점 규칙 파일(rules/timing-rules.json) 읽기·검사·성분 이름 인식 (순수 함수)
import rawRules from '../../rules/timing-rules.json'
import { SLOTS, type Slot } from './types'

/** supported = 공식 건강정보에 근거, limited = 근거가 약하거나 일반적 관행 */
export type Evidence = 'supported' | 'limited'

export interface RuleSource {
  title: string
  url: string
}

export interface IngredientRule {
  id: string
  name: string
  /** 성분·제품 이름에서 찾을 별칭 (공백·기호·대소문자 무시) */
  aliases: string[]
  /** 추천 순서 */
  slots: Slot[]
  reason: string
  evidence: Evidence
  sources: RuleSource[]
}

export interface ConflictRule {
  a: string
  b: string
  /** 이보다 가까우면 경고 (분) */
  minGapMinutes: number
  reason: string
  evidence: Evidence
  sources: RuleSource[]
}

export interface RulesFile {
  version: number
  ingredients: IngredientRule[]
  /** 성분 이름에 들어 있어도 영양 성분으로 보지 않는 첨가물 (예: 스테아르산마그네슘) */
  ignore: { aliases: string[] }
  conflicts: ConflictRule[]
}

/** 비교용 이름: 소문자, 한글·영문·숫자만 남김 ("오메가-3" → "오메가3", "Vitamin D3" → "vitamind3") */
export function normalizeName(value: string): string {
  return value.toLowerCase().replace(/[^0-9a-z가-힣]/g, '')
}

/** 규칙 파일 형식 검사. 오류 문구 목록 (비어 있으면 정상) */
export function validateRules(raw: unknown): string[] {
  const errors: string[] = []
  const r = raw as Partial<RulesFile> | null
  if (!r || typeof r !== 'object') return ['규칙 파일이 객체가 아닙니다']
  if (typeof r.version !== 'number') errors.push('version이 없습니다')
  if (!Array.isArray(r.ingredients)) return [...errors, 'ingredients가 배열이 아닙니다']
  if (!Array.isArray(r.conflicts)) return [...errors, 'conflicts가 배열이 아닙니다']
  if (!r.ignore || !Array.isArray(r.ignore.aliases)) errors.push('ignore.aliases가 배열이 아닙니다')

  const ids = new Set<string>()
  const aliasOwner = new Map<string, string>()
  const claimAlias = (alias: string, owner: string) => {
    const key = normalizeName(alias)
    if (!key) errors.push(`${owner}: 빈 별칭`)
    else if (aliasOwner.has(key)) errors.push(`별칭 '${alias}'이(가) ${aliasOwner.get(key)}와(과) ${owner}에 중복`)
    else aliasOwner.set(key, owner)
  }

  for (const rule of r.ingredients) {
    const id = rule?.id
    if (typeof id !== 'string' || !id) {
      errors.push('id가 없는 성분 규칙')
      continue
    }
    if (ids.has(id)) errors.push(`${id}: id 중복`)
    ids.add(id)
    if (typeof rule.name !== 'string' || !rule.name) errors.push(`${id}: name이 없습니다`)
    if (!Array.isArray(rule.aliases) || rule.aliases.length === 0) errors.push(`${id}: aliases가 비었습니다`)
    else rule.aliases.forEach((a) => claimAlias(a, id))
    if (!Array.isArray(rule.slots) || rule.slots.length === 0) errors.push(`${id}: slots가 비었습니다`)
    else {
      if (rule.slots.some((s) => !SLOTS.includes(s))) errors.push(`${id}: 알 수 없는 slot`)
      if (new Set(rule.slots).size !== rule.slots.length) errors.push(`${id}: slot 중복`)
    }
    if (typeof rule.reason !== 'string' || !rule.reason) errors.push(`${id}: reason이 없습니다`)
    checkEvidence(rule, id, errors)
  }
  r.ignore?.aliases?.forEach((a) => claimAlias(a, 'ignore'))

  for (const c of r.conflicts) {
    const label = `충돌 ${c?.a}-${c?.b}`
    if (!ids.has(c?.a) || !ids.has(c?.b)) errors.push(`${label}: 없는 성분 id`)
    if (c?.a === c?.b) errors.push(`${label}: 같은 성분끼리`)
    if (!Number.isInteger(c?.minGapMinutes) || c.minGapMinutes <= 0) errors.push(`${label}: minGapMinutes 오류`)
    if (typeof c?.reason !== 'string' || !c.reason) errors.push(`${label}: reason이 없습니다`)
    checkEvidence(c, label, errors)
  }
  return errors
}

function checkEvidence(item: { evidence?: unknown; sources?: unknown }, label: string, errors: string[]): void {
  if (item.evidence !== 'supported' && item.evidence !== 'limited') errors.push(`${label}: evidence 오류`)
  if (!Array.isArray(item.sources)) {
    errors.push(`${label}: sources가 배열이 아닙니다`)
    return
  }
  for (const s of item.sources as Partial<RuleSource>[]) {
    if (!s?.title || typeof s.url !== 'string' || !s.url.startsWith('https://')) errors.push(`${label}: 출처 형식 오류`)
  }
  if (item.evidence === 'supported' && item.sources.length === 0) errors.push(`${label}: supported인데 출처가 없습니다`)
}

export function loadRules(raw: unknown): RulesFile {
  const errors = validateRules(raw)
  if (errors.length > 0) throw new Error(`규칙 파일 오류:\n${errors.join('\n')}`)
  return raw as RulesFile
}

/** 앱에서 쓰는 규칙 (rules/timing-rules.json) */
export const RULES: RulesFile = loadRules(rawRules)

/**
 * 이름에서 규칙 성분을 찾는다. 긴 별칭이 짧은 별칭을 덮는다
 * (예: '판토텐산칼슘'은 비타민 B군이지 칼슘이 아니고, '스테아르산마그네슘'은 첨가물이다).
 */
export function matchIngredients(name: string, rules: RulesFile = RULES): IngredientRule[] {
  const text = normalizeName(name)
  if (!text) return []

  interface Span {
    start: number
    end: number
    ruleId: string | null
  }
  const spans: Span[] = []
  const collect = (alias: string, ruleId: string | null) => {
    const key = normalizeName(alias)
    if (!key) return
    for (let i = text.indexOf(key); i !== -1; i = text.indexOf(key, i + 1)) {
      spans.push({ start: i, end: i + key.length, ruleId })
    }
  }
  for (const rule of rules.ingredients) rule.aliases.forEach((a) => collect(a, rule.id))
  rules.ignore.aliases.forEach((a) => collect(a, null))

  const covered = (s: Span) =>
    spans.some((o) => o !== s && o.start <= s.start && o.end >= s.end && o.end - o.start > s.end - s.start)
  const found = new Set(spans.filter((s) => s.ruleId !== null && !covered(s)).map((s) => s.ruleId))
  return rules.ingredients.filter((rule) => found.has(rule.id))
}
