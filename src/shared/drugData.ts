// 공공데이터포털 '식품의약품안전처_의약품 제품 허가정보'(상세정보) 응답 → 입력 창 값 (순수 함수)
// 영양제 검색에는 일반의약품(약국 비타민제 등)만 쓴다. 전문의약품은 처방약 탭에서 처방전대로 입력한다.
import type { PublicProduct } from './publicData'
import { INSTRUCTION_MAX } from './supplementInput'
import type { IngredientDraft } from './types'

/** 허가 상세정보 응답의 한 항목 (쓰는 필드만) */
export interface DrugDetailItem {
  ITEM_SEQ?: string | null
  /** 제품명 */
  ITEM_NAME?: string | null
  /** 업체명 (판매·허가 회사) */
  ENTP_NAME?: string | null
  /** '일반의약품' | '전문의약품' */
  ETC_OTC_CODE?: string | null
  /** '정상' | '취하' | '취소' … */
  CANCEL_NAME?: string | null
  /** 성상 (예: 흰색의 타원형 필름코팅정) */
  CHART?: string | null
  /** 원료약품 및 그 분량: "총량 : …|성분명 : …|분량 : …|단위 : …|…;총량 : …" */
  MATERIAL_NAME?: string | null
  /** 용법용량 문서 (XML) */
  UD_DOC_DATA?: string | null
}

/** 영양제로 고를 수 있는 의약품인지: 일반의약품 + 허가가 살아 있음 */
export function isSelectableOtc(item: DrugDetailItem): boolean {
  const cancel = (item.CANCEL_NAME ?? '').trim()
  return item.ETC_OTC_CODE === '일반의약품' && (cancel === '' || cancel === '정상')
}

export function toDrugProduct(item: DrugDetailItem): PublicProduct {
  const name = clean(item.ITEM_NAME)
  const manufacturer = clean(item.ENTP_NAME)
  const intakeMethod = docToText(item.UD_DOC_DATA ?? '').slice(0, INSTRUCTION_MAX)
  return {
    reportNo: `drug:${clean(item.ITEM_SEQ)}`,
    category: 'otc_drug',
    name,
    manufacturer,
    intakeMethod,
    primaryFunction: clean(item.CHART),
    caution: '',
    draft: {
      name,
      manufacturer,
      labelInstruction: intakeMethod,
      ingredients: parseMaterials(item.MATERIAL_NAME ?? ''),
      schedule: [],
      source: 'public_data'
    }
  }
}

/**
 * 원료약품 분량 → 성분 목록. 같은 성분이 반복되면 하나만 남긴다.
 * 주의: 분량은 '원료' 기준이다 (예: '콜레칼시페롤농축분말 10mg'은 비타민D 10mg이 아니다).
 */
export function parseMaterials(material: string): IngredientDraft[] {
  const seen = new Set<string>()
  const result: IngredientDraft[] = []
  for (const group of material.split(';')) {
    const fields = new Map<string, string>()
    for (const part of group.split('|')) {
      const colon = part.indexOf(':')
      if (colon > 0) fields.set(part.slice(0, colon).trim(), part.slice(colon + 1).trim())
    }
    const name = fields.get('성분명') ?? ''
    if (!name) continue
    const rawAmount = (fields.get('분량') ?? '').replace(/,/g, '')
    const number = Number(rawAmount)
    const amount = rawAmount !== '' && Number.isFinite(number) ? String(number) : ''
    const unit = amount ? normalizeUnit(fields.get('단위') ?? '') : ''
    const key = `${name}|${amount}|${unit}`
    if (seen.has(key)) continue
    seen.add(key)
    result.push({ name, amount, unit })
  }
  return result
}

const UNIT_NAMES: Record<string, string> = {
  밀리그램: 'mg',
  마이크로그램: 'μg',
  나노그램: 'ng',
  그램: 'g',
  밀리리터: 'mL',
  국제단위: 'IU',
  아이유: 'IU'
}

function normalizeUnit(unit: string): string {
  const u = unit.trim()
  return UNIT_NAMES[u] ?? u
}

/** 허가정보 문서(XML) → 한 줄 글. CDATA 안의 문장만 이어 붙이고 HTML 문자 코드를 푼다 */
export function docToText(xml: string): string {
  const parts = [...xml.matchAll(/<!\[CDATA\[([\s\S]*?)\]\]>/g)].map((m) => m[1])
  const text = parts.length > 0 ? parts.join(' ') : xml.replace(/<[^>]+>/g, ' ')
  return decodeEntities(text.replace(/<[^>]+>/g, ' '))
    .replace(/\s+/g, ' ')
    .trim()
}

function decodeEntities(text: string): string {
  const named: Record<string, string> = { nbsp: ' ', amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" }
  return text
    .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec: string) => String.fromCodePoint(Number(dec)))
    .replace(/&([a-z]+);/gi, (whole, name: string) => named[name.toLowerCase()] ?? whole)
}

function clean(value: string | null | undefined): string {
  return (value ?? '').replace(/\s+/g, ' ').trim()
}
