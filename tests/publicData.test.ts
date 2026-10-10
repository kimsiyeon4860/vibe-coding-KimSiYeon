import type { SqlDatabase } from '../src/core/db/sql'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { openDatabase } from '../src/main/db/connection'
import { createSupplement, getSupplement, updateSupplement } from '../src/core/db/supplements'
import { buildSearchUrl, searchSupplements } from '../src/core/services/foodSafety'
import { parseRawMaterials, parseStandardIngredients, toPublicProduct } from '../src/shared/publicData'
import { recommend } from '../src/shared/recommend'
import { DEFAULT_SETTINGS } from '../src/shared/schedule'
import { parseSupplementDraft } from '../src/shared/supplementInput'
import fixture from './fixtures/i0030-sample.json'

const ing = (name: string, amount = '', unit = '') => ({ name, amount, unit })

describe('기준규격에서 성분·함량 뽑기', () => {
  it.each([
    ['4. 비타민D : 표시량(25ug/2540mg)의 80~180%', ing('비타민D', '25', 'μg')],
    ['4. 비타민D : 표시량(5㎍/2g)의 80~180%', ing('비타민D', '5', 'μg')],
    ['② 비타민D : 10 ㎍ / 2 g (표시량의 80-180%)', ing('비타민D', '10', 'μg')],
    ['(3) 비타민E : 표시량(3.3 mgα-TE /900 mg)의 80%이상 150%이하', ing('비타민E', '3.3', 'mgα-TE')],
    ['2) EPA와 DHA의 합 : 표시량의 80% ~ 120% ( 표시량 : 1,000mg / 1,500mg )', ing('EPA와 DHA', '1000', 'mg')],
    ['2) EPA와DHA의합: 표시량(600mg/900mg)의 80~120%', ing('EPA와DHA', '600', 'mg')],
    ['2. 프로바이오틱스 수 : 표시량{10,000,000,000(100억)CFU/2g} 이상', ing('프로바이오틱스', '10000000000', 'CFU')],
    ['2. 프로바이오틱스 수(표시량 300,000,000,000(3,000억) CFU/g) : 표시량 이상', ing('프로바이오틱스', '300000000000', 'CFU')],
    ['3)프로바이오틱스 수 :표시량(100,000,000,000 cfu/g) 이상', ing('프로바이오틱스', '100000000000', 'CFU')],
    ['프로바이오틱스 수  표시량: 300.000.000CFU/2,000mg', ing('프로바이오틱스', '300000000', 'CFU')],
    ['엠에스엠 : 표시량(2000mg/2400mg)의 80~120%', ing('엠에스엠', '2000', 'mg')],
    // 단위 중간에 띄어쓰기 (아르포텐 솔루션)
    ['3. 나이아신 : 표시량(15mg NE/30ml)의 80~150%', ing('나이아신', '15', 'mg NE')],
    ['3) 비타민E : 표시량(11 mg α-TE / 900 mg)의 80~150%', ing('비타민E', '11', 'mg α-TE')]
  ])('%s', (line, expected) => {
    expect(parseStandardIngredients(line)).toEqual([expected])
  })

  it('표시량이 없는 품질 기준 줄은 뺀다', () => {
    const standard = '1. 성상 : 고유의 향미\n2. 대장균군 : 음성\n3. 납 : 1.0 mg/kg 이하\n4. 아연 : 표시량(5mg/2g)의 80~150%'
    expect(parseStandardIngredients(standard)).toEqual([ing('아연', '5', 'mg')])
  })

  it('원재료 이름 (중복 제거)', () => {
    expect(parseRawMaterials('비타민 D, 비타민 E, EPA 및 DHA 함유 유지, 비타민 D')).toEqual([
      ing('비타민 D'),
      ing('비타민 E'),
      ing('EPA 및 DHA 함유 유지')
    ])
  })
})

describe('실제 응답 15건 (식품안전나라 견본)', () => {
  const products = fixture.I0030.row.map(toPublicProduct)

  it('모든 제품에서 성분을 하나 이상 얻는다', () => {
    for (const p of products) expect(p.draft.ingredients.length, p.name).toBeGreaterThan(0)
  })

  it('표시량이 없는 제품은 원재료 이름만 (함량 비움)', () => {
    const p = products.find((x) => x.name.startsWith('7종혼합유산균'))!
    expect(p.draft.ingredients).toEqual([ing('프로바이오틱스')])
  })

  it('입력 창 값: 섭취방법이 라벨로, 출처는 공공데이터, 복용 시점은 비움', () => {
    const p = products.find((x) => x.name === '3중케어 칼슘마그네슘비타민D')!
    expect(p.draft).toMatchObject({
      manufacturer: p.manufacturer,
      labelInstruction: p.intakeMethod,
      schedule: [],
      source: 'public_data'
    })
    expect(p.draft.ingredients.map((i) => i.name)).toEqual(['칼슘', '마그네슘', '비타민D'])
  })

  it('검사를 통과하고, 추천에서 성분이 인식된다', () => {
    const p = products.find((x) => x.name === '20100 알티지 오메가3 맥스 2000 플러스')!
    const parsed = parseSupplementDraft(p.draft)
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    const [rec] = recommend(
      [
        {
          ...parsed.value,
          id: 1,
          source: 'public_data',
          active: true,
          createdAt: '',
          schedule: []
        }
      ],
      DEFAULT_SETTINGS
    )
    expect(rec.reasons.join(' ')).toContain('비타민 D')
    expect(rec.reasons.join(' ')).toContain('오메가3')
  })
})

describe('식품안전나라 검색', () => {
  const okResponse = (body: unknown) =>
    vi.fn(async () => new Response(JSON.stringify(body), { status: 200 })) as unknown as typeof fetch

  it('주소: 키·서비스·제품명·제조사', () => {
    expect(buildSearchUrl('KEY', '비타민D', '종근당')).toBe(
      'https://openapi.foodsafetykorea.go.kr/api/KEY/I0030/json/1/20/' +
        `PRDLST_NM=${encodeURIComponent('비타민D')}&BSSH_NM=${encodeURIComponent('종근당')}`
    )
    expect(buildSearchUrl('KEY', '비타민D', '')).not.toContain('BSSH_NM')
  })

  it('정상 응답 → 제품 목록', async () => {
    const result = await searchSupplements('비타민D', '', { apiKey: 'KEY', fetchImpl: okResponse(fixture) })
    expect(result.ok && result.items).toHaveLength(15)
  })

  it('결과 없음 → 빈 목록', async () => {
    const empty = { I0030: { total_count: '0', RESULT: { MSG: '해당하는 데이터가 없습니다.', CODE: 'INFO-200' } } }
    expect(await searchSupplements('없는제품', '', { apiKey: 'KEY', fetchImpl: okResponse(empty) })).toEqual({
      ok: true,
      items: [],
      total: 0
    })
  })

  it('키가 없거나 틀리면 직접 입력 안내', async () => {
    const fetchImpl = vi.fn() as unknown as typeof fetch
    expect(await searchSupplements('비타민D', '', { apiKey: undefined, fetchImpl })).toMatchObject({ ok: false })
    expect(fetchImpl).not.toHaveBeenCalled()

    const invalid = { I0030: { RESULT: { MSG: '인증키가 유효하지 않습니다.', CODE: 'INFO-100' } } }
    const result = await searchSupplements('비타민D', '', { apiKey: 'BAD', fetchImpl: okResponse(invalid) })
    expect(result).toEqual({ ok: false, error: '식품안전나라 API 키가 올바르지 않습니다. .env의 키를 확인해 주세요.' })
  })

  it('네트워크 오류·서버 오류에도 예외 없이 안내', async () => {
    const offline = vi.fn(async () => {
      throw new TypeError('fetch failed')
    }) as unknown as typeof fetch
    expect(await searchSupplements('비타민D', '', { apiKey: 'KEY', fetchImpl: offline })).toMatchObject({ ok: false })

    const serverError = vi.fn(async () => new Response('', { status: 500 })) as unknown as typeof fetch
    expect(await searchSupplements('비타민D', '', { apiKey: 'KEY', fetchImpl: serverError })).toMatchObject({
      ok: false
    })
  })

  it('제품명이 비면 호출하지 않는다', async () => {
    const fetchImpl = vi.fn() as unknown as typeof fetch
    expect(await searchSupplements('  ', '종근당', { apiKey: 'KEY', fetchImpl })).toMatchObject({ ok: false })
    expect(fetchImpl).not.toHaveBeenCalled()
  })
})

describe('출처 저장', () => {
  let db: SqlDatabase
  beforeEach(() => {
    db = openDatabase(':memory:')
  })
  afterEach(() => db.close())

  const draft = { name: '비타민D', manufacturer: '', labelInstruction: '', ingredients: [], schedule: [] }

  it('검색으로 채우면 public_data, 아니면 manual', () => {
    const fromSearch = parseSupplementDraft({ ...draft, source: 'public_data' })
    const manual = parseSupplementDraft({ ...draft, source: 'web_search' }) // 화면에서 올 수 없는 값은 무시
    expect(fromSearch.ok && fromSearch.value.source).toBe('public_data')
    expect(manual.ok && manual.value.source).toBeUndefined()
  })

  it('수정 시: 검색으로 다시 채웠을 때만 출처가 바뀐다', () => {
    const { id } = createSupplement(db, { ...draft, ingredients: [], schedule: [] })
    updateSupplement(db, id, { ...draft, ingredients: [], schedule: [], name: '비타민D3' })
    expect(getSupplement(db, id)?.source).toBe('manual')
    updateSupplement(db, id, { ...draft, ingredients: [], schedule: [], source: 'public_data' })
    expect(getSupplement(db, id)?.source).toBe('public_data')
  })
})
