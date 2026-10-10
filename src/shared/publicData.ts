// 식품안전나라 '건강기능식품 품목제조 신고사항(I0030)' 응답 → 입력 창 값 (순수 함수)
// 일반의약품(공공데이터포털 허가정보)은 drugData.ts에서 같은 PublicProduct 형태로 바꾼다.
// 자동으로 가져온 값은 저장 전에 사용자가 반드시 확인·수정한다 (CLAUDE.md 6-1).
import type { IngredientDraft, SupplementDraft } from './types'

/** I0030 응답의 한 행 (쓰는 필드만) */
export interface I0030Row {
  PRDLST_REPORT_NO?: string
  /** 제품명 */
  PRDLST_NM?: string
  /** 업소명 (제조사) */
  BSSH_NM?: string
  /** 섭취방법 */
  NTK_MTHD?: string
  /** 원재료 (기능성 원료) */
  RAWMTRL_NM?: string
  /** 기준규격 (표시량 포함) */
  STDR_STND?: string
  /** 주된 기능성 */
  PRIMARY_FNCLTY?: string
  /** 섭취 시 주의사항 */
  IFTKN_ATNT_MATR_CN?: string
}

/** 검색 결과 종류: 건강기능식품(식품안전나라) / 일반의약품(공공데이터포털) */
export type ProductCategory = 'health_food' | 'otc_drug'

export const PRODUCT_CATEGORY_LABELS: Record<ProductCategory, string> = {
  health_food: '건강기능식품',
  otc_drug: '일반의약품'
}

/** 검색 결과 한 건 */
export interface PublicProduct {
  /** 결과 구분용 (건강기능식품은 품목제조번호, 의약품은 'drug:품목기준코드') */
  reportNo: string
  category: ProductCategory
  name: string
  manufacturer: string
  intakeMethod: string
  primaryFunction: string
  caution: string
  /** 이 제품으로 채울 입력 창 값 (복용 시점은 비어 있음) */
  draft: SupplementDraft
}

export type SupplementSearchResult =
  | {
      ok: true
      items: PublicProduct[]
      total: number
      /** 한쪽 검색만 실패했을 때 등 결과와 함께 보여줄 안내 */
      notices?: string[]
    }
  | { ok: false; error: string }

export function toPublicProduct(row: I0030Row): PublicProduct {
  const name = clean(row.PRDLST_NM)
  const manufacturer = clean(row.BSSH_NM)
  const intakeMethod = clean(row.NTK_MTHD)
  const fromStandard = parseStandardIngredients(row.STDR_STND ?? '')
  const ingredients = fromStandard.length > 0 ? fromStandard : parseRawMaterials(row.RAWMTRL_NM ?? '')
  return {
    reportNo: clean(row.PRDLST_REPORT_NO),
    category: 'health_food',
    name,
    manufacturer,
    intakeMethod,
    primaryFunction: clean(row.PRIMARY_FNCLTY),
    caution: (row.IFTKN_ATNT_MATR_CN ?? '').trim(),
    draft: {
      name,
      manufacturer,
      labelInstruction: intakeMethod,
      ingredients,
      schedule: [],
      source: 'public_data'
    }
  }
}

/**
 * 기준규격에서 '표시량'이 있는 줄만 성분으로 뽑는다 (성상·대장균군·납 같은 품질 기준은 표시량이 없어 빠진다).
 * 예) "4. 비타민D : 표시량(25ug/2540mg)의 80~180%" → 비타민D 25 μg
 *     "② 비타민D : 10 ㎍ / 2 g (표시량의 80-180%)" → 비타민D 10 μg
 *     "2. 프로바이오틱스 수 : 표시량{10,000,000,000(100억)CFU/2g} 이상" → 프로바이오틱스 10000000000 CFU
 */
export function parseStandardIngredients(standard: string): IngredientDraft[] {
  const result: IngredientDraft[] = []
  for (const rawLine of standard.split(/\r?\n/)) {
    if (!rawLine.includes('표시량')) continue
    const line = rawLine.replace(/^\s*(?:\(?\d+[).]|[①-⑳])\s*/, '').trim()

    // 성분명: ':' 또는 '표시량' 앞까지
    const cut = [line.indexOf(':'), line.indexOf('(표시량'), line.indexOf('표시량')].filter((i) => i > 0)
    if (cut.length === 0) continue
    const nameEnd = Math.min(...cut)
    const name = line
      .slice(0, nameEnd)
      .trim()
      .replace(/\s*(?:의\s*합|수)$/, '')
      .trim()
    if (!name) continue

    // 함량: 이름 뒤에서 처음 나오는 "숫자 [괄호] 단위 /" (예: 25ug/, 10 ㎍ /, 10,000(100억)CFU/)
    // 단위는 띄어 쓴 경우도 있다 (예: "15mg NE/", "11 mg α-TE /")
    const rest = line.slice(nameEnd)
    const match = /(\d[\d,.]*)\s*(?:\([^)]*\))?\s*([A-Za-zµμ㎍㎎α-]*(?:\s+[A-Za-zµμ㎍㎎α-]+)*)\s*\//.exec(rest)
    const amount = match ? parseAmount(match[1]) : null
    result.push({
      name,
      amount: amount === null ? '' : String(amount),
      unit: match && amount !== null ? normalizeUnit(match[2]) : ''
    })
  }
  return result
}

/** 표시량이 없을 때: 원재료 이름만 (함량 없음) */
export function parseRawMaterials(raw: string): IngredientDraft[] {
  const names = raw
    .split(/[,，]/)
    .map((n) => n.trim())
    .filter(Boolean)
  return [...new Set(names)].map((name) => ({ name, amount: '', unit: '' }))
}

/** "10,000,000,000" / "300.000.000"(마침표를 천 단위로 쓴 경우) / "3.3" → 숫자 */
function parseAmount(text: string): number | null {
  let t = text.replace(/,/g, '').replace(/\.$/, '')
  if ((t.match(/\./g) ?? []).length > 1) t = t.replace(/\./g, '')
  const n = Number(t)
  return Number.isFinite(n) && n >= 0 ? n : null
}

function normalizeUnit(unit: string): string {
  const u = unit.trim()
  if (/^(ug|mcg|µg|㎍)$/i.test(u)) return 'μg'
  if (u === '㎎') return 'mg'
  if (/^cfu$/i.test(u)) return 'CFU'
  return u
}

function clean(value: string | undefined): string {
  return (value ?? '').replace(/\s+/g, ' ').trim()
}

/**
 * 건강기능식품·일반의약품 검색 결과를 합친다. 한쪽만 실패하면 다른 쪽 결과에 안내를 붙이고,
 * 둘 다 실패하면 두 오류를 함께 알린다.
 */
export function mergeSearchResults(
  healthFood: SupplementSearchResult,
  otcDrug: SupplementSearchResult
): SupplementSearchResult {
  if (!healthFood.ok && !otcDrug.ok) {
    return { ok: false, error: [`건강기능식품: ${healthFood.error}`, `일반의약품: ${otcDrug.error}`].join('\n') }
  }
  const notices: string[] = []
  if (!healthFood.ok) notices.push(`건강기능식품: ${healthFood.error}`)
  if (!otcDrug.ok) notices.push(`일반의약품: ${otcDrug.error}`)
  const parts = [healthFood, otcDrug].filter((r) => r.ok)
  return {
    ok: true,
    items: parts.flatMap((r) => r.items),
    total: parts.reduce((sum, r) => sum + r.total, 0),
    ...(notices.length > 0 ? { notices } : {})
  }
}
