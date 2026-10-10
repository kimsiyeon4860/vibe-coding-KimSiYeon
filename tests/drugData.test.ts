import { describe, expect, it, vi } from 'vitest'
import { buildDrugSearchUrl, searchOtcDrugs } from '../src/main/services/drugInfo'
import { docToText, isSelectableOtc, parseMaterials, toDrugProduct } from '../src/shared/drugData'
import { mergeSearchResults, type SupplementSearchResult } from '../src/shared/publicData'
import { recommend, rulesOf } from '../src/shared/recommend'
import { DEFAULT_SETTINGS } from '../src/shared/schedule'
import { parseSupplementDraft } from '../src/shared/supplementInput'
import fixture from './fixtures/drug-detail-sample.json'

const items = fixture.body.items
const byName = (name: string) => items.find((i) => i.ITEM_NAME === name)!

describe('용법용량 문서 → 글', () => {
  it('CDATA 문장만 이어 붙이고 HTML 문자 코드를 푼다', () => {
    const xml =
      '<DOC title="용법용량" type="UD"><SECTION title=""><ARTICLE title="">' +
      '<PARAGRAPH><![CDATA[12세 이상 어린이 및 성인:&nbsp;1일 1회 2정]]></PARAGRAPH>' +
      '<PARAGRAPH><![CDATA[병중&#x2219;병후 &amp; 발육기]]></PARAGRAPH></ARTICLE></SECTION></DOC>'
    expect(docToText(xml)).toBe('12세 이상 어린이 및 성인: 1일 1회 2정 병중∙병후 & 발육기')
  })

  it('실제 응답', () => {
    expect(docToText(byName('유한비타민씨디정').UD_DOC_DATA)).toBe('만 8세 이상 및 성인: 1회 1정, 1일 1~2회 복용')
  })
})

describe('원료약품 분량 → 성분', () => {
  it('성분명·분량·단위를 읽고 단위를 바꾼다', () => {
    expect(parseMaterials(byName('유한비타민씨디정').MATERIAL_NAME)).toEqual([
      { name: '아스코르브산 과립97%', amount: '515.5', unit: 'mg' },
      { name: '농축콜레칼시페롤 산', amount: '5', unit: 'mg' }
    ])
  })

  it('반복되는 성분은 하나만 (아로나민골드정은 목록이 두 번 들어 있음)', () => {
    const list = parseMaterials(byName('아로나민골드정').MATERIAL_NAME)
    expect(list.map((i) => i.name)).toEqual([
      '푸르설티아민',
      '리보플라빈부티레이트',
      '피리독살포스페이트수화물',
      '히드록소코발라민아세트산염',
      '아스코르브산',
      '토코페롤아세테이트 2배산'
    ])
    expect(list.find((i) => i.name.startsWith('히드록소'))).toMatchObject({ amount: '5.22', unit: 'μg' })
  })

  it('분량이 없으면 이름만', () => {
    expect(parseMaterials('총량 : 1정|성분명 : 비타민|분량 : |단위 : 밀리그램')).toEqual([
      { name: '비타민', amount: '', unit: '' }
    ])
  })
})

describe('고를 수 있는 제품', () => {
  it('일반의약품 + 허가 정상만', () => {
    expect(items.filter(isSelectableOtc).map((i) => i.ITEM_NAME)).toEqual([
      '유한비타민씨디정',
      '아로나민골드정',
      '비맥스골드정',
      '임팩타민정'
    ])
  })
})

describe('입력 창 값', () => {
  it('제품명·회사·용법용량·성분, 출처는 공공데이터', () => {
    const p = toDrugProduct(byName('유한비타민씨디정'))
    expect(p).toMatchObject({ category: 'otc_drug', manufacturer: '(주)유한양행' })
    expect(p.draft).toMatchObject({
      name: '유한비타민씨디정',
      manufacturer: '(주)유한양행',
      labelInstruction: '만 8세 이상 및 성인: 1회 1정, 1일 1~2회 복용',
      source: 'public_data',
      schedule: []
    })
    expect(parseSupplementDraft(p.draft).ok).toBe(true)
  })

  it('의약품식 성분 이름도 규칙에서 알아본다', () => {
    const ids = (name: string) => {
      const parsed = parseSupplementDraft(toDrugProduct(byName(name)).draft)
      if (!parsed.ok) throw new Error(parsed.errors.join())
      return rulesOf(parsed.value).map((r) => r.id)
    }
    expect(ids('유한비타민씨디정')).toEqual(['vitamin_d'])
    expect(ids('아로나민골드정')).toEqual(['vitamin_e', 'vitamin_b'])
    expect(ids('비맥스골드정')).toEqual(expect.arrayContaining(['vitamin_d', 'vitamin_e', 'vitamin_b', 'magnesium', 'zinc']))
  })

  it("라벨이 '식후'라고만 하면 추천이 식사 시점으로 간다 (비맥스골드정: 1일 1회 식후)", () => {
    const parsed = parseSupplementDraft(toDrugProduct(byName('비맥스골드정')).draft)
    if (!parsed.ok) throw new Error()
    const [rec] = recommend(
      [{ ...parsed.value, id: 1, source: 'public_data', active: true, createdAt: '', schedule: [] }],
      DEFAULT_SETTINGS
    )
    expect(['breakfast', 'lunch', 'dinner']).toContain(rec.slots[0])
  })
})

describe('의약품 검색', () => {
  const respond = (body: unknown, status = 200) =>
    vi.fn(async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch

  it('주소: 상세정보, 제품명, 일반 인증키', () => {
    const url = new URL(buildDrugSearchUrl('KEY+/=', '유한비타민'))
    expect(url.pathname).toBe('/1471000/DrugPrdtPrmsnInfoService08/getDrugPrdtPrmsnDtlInq08')
    expect(url.searchParams.get('serviceKey')).toBe('KEY+/=')
    expect(url.searchParams.get('item_name')).toBe('유한비타민')
    expect(url.searchParams.get('type')).toBe('json')
  })

  it('정상 응답 → 일반의약품·허가 정상만', async () => {
    const result = await searchOtcDrugs('비타민', { apiKey: 'KEY', fetchImpl: respond(fixture) })
    expect(result.ok && result.items.map((p) => p.name)).toHaveLength(4)
  })

  it('결과 없음 (items가 빈 문자열로 올 때도)', async () => {
    const empty = { header: { resultCode: '00', resultMsg: 'NORMAL SERVICE.' }, body: { totalCount: 0, items: '' } }
    expect(await searchOtcDrugs('없는약', { apiKey: 'KEY', fetchImpl: respond(empty) })).toEqual({
      ok: true,
      items: [],
      total: 0
    })
  })

  it('키 없음·키 오류(401)·네트워크 오류 → 안내', async () => {
    const neverCalled = vi.fn() as unknown as typeof fetch
    expect(await searchOtcDrugs('비타민', { apiKey: undefined, fetchImpl: neverCalled })).toMatchObject({ ok: false })
    expect(neverCalled).not.toHaveBeenCalled()
    expect(await searchOtcDrugs('비타민', { apiKey: 'BAD', fetchImpl: respond('Unauthorized', 401) })).toMatchObject({
      ok: false
    })
    const offline = vi.fn(async () => {
      throw new TypeError('fetch failed')
    }) as unknown as typeof fetch
    expect(await searchOtcDrugs('비타민', { apiKey: 'KEY', fetchImpl: offline })).toMatchObject({ ok: false })
  })
})

describe('두 검색 결과 합치기', () => {
  const ok = (names: string[]): SupplementSearchResult => ({
    ok: true,
    items: names.map((name) => toDrugProduct({ ITEM_NAME: name, ITEM_SEQ: name })),
    total: names.length
  })
  const fail = (error: string): SupplementSearchResult => ({ ok: false, error })

  it('둘 다 성공하면 이어 붙인다', () => {
    const merged = mergeSearchResults(ok(['A']), ok(['B', 'C']))
    expect(merged).toMatchObject({ ok: true, total: 3 })
    expect(merged.ok && merged.items.map((i) => i.name)).toEqual(['A', 'B', 'C'])
    expect(merged.ok && merged.notices).toBeUndefined()
  })

  it('한쪽만 실패하면 결과 + 안내', () => {
    expect(mergeSearchResults(ok(['A']), fail('키 없음'))).toMatchObject({
      ok: true,
      total: 1,
      notices: ['일반의약품: 키 없음']
    })
  })

  it('둘 다 실패하면 두 오류를 함께', () => {
    expect(mergeSearchResults(fail('X'), fail('Y'))).toEqual({ ok: false, error: '건강기능식품: X\n일반의약품: Y' })
  })
})
