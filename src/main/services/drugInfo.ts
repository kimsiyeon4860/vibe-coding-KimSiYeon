// 공공데이터포털 '식품의약품안전처_의약품 제품 허가정보' 상세정보 검색. 메인 프로세스에서만 호출한다.
// 인증키는 .env의 DATA_GO_KR_API_KEY (공공데이터포털 '일반 인증키'). 영양제 검색에는 일반의약품만 돌려준다.
import { isSelectableOtc, toDrugProduct, type DrugDetailItem } from '../../shared/drugData'
import type { SupplementSearchResult } from '../../shared/publicData'
import type { SearchOptions } from './foodSafety'

const DETAIL_URL = 'https://apis.data.go.kr/1471000/DrugPrdtPrmsnInfoService08/getDrugPrdtPrmsnDtlInq08'
/** 전문의약품·허가 취하 제품을 거르고 나면 줄어드니 넉넉히 받는다 */
const FETCH_ROWS = 50
const MAX_RESULTS = 20
const TIMEOUT_MS = 10_000

interface DrugDetailResponse {
  header?: { resultCode?: string; resultMsg?: string }
  body?: { totalCount?: number; items?: DrugDetailItem[] | '' }
}

export function buildDrugSearchUrl(apiKey: string, name: string): string {
  const params = new URLSearchParams({ serviceKey: apiKey, type: 'json', pageNo: '1', numOfRows: String(FETCH_ROWS), item_name: name })
  return `${DETAIL_URL}?${params}`
}

/** 제품명으로 일반의약품 검색. 실패해도 예외 대신 사용자에게 보여줄 문구를 돌려준다 */
export async function searchOtcDrugs(name: string, { apiKey, fetchImpl = fetch }: SearchOptions): Promise<SupplementSearchResult> {
  const query = name.trim()
  if (!query) return { ok: false, error: '제품명을 입력해 주세요' }
  if (!apiKey) return { ok: false, error: '공공데이터포털 API 키가 설정되지 않아 일반의약품은 검색하지 못했습니다.' }

  let body: DrugDetailResponse
  try {
    const response = await fetchImpl(buildDrugSearchUrl(apiKey, query), { signal: AbortSignal.timeout(TIMEOUT_MS) })
    if (response.status === 401 || response.status === 403) {
      return { ok: false, error: '공공데이터포털 API 키가 올바르지 않거나 아직 활성화되지 않았습니다. 잠시 후 다시 시도해 주세요.' }
    }
    if (!response.ok) return { ok: false, error: `의약품 검색 서버 오류 (${response.status})` }
    body = (await response.json()) as DrugDetailResponse
  } catch {
    return { ok: false, error: '일반의약품을 검색하지 못했습니다. 인터넷 연결을 확인해 주세요.' }
  }

  if (body.header?.resultCode !== '00') {
    return { ok: false, error: `의약품 검색 서버 응답 오류: ${body.header?.resultMsg ?? '알 수 없음'}` }
  }
  const rows = Array.isArray(body.body?.items) ? body.body.items : []
  const items = rows.filter(isSelectableOtc).slice(0, MAX_RESULTS).map(toDrugProduct)
  return { ok: true, items, total: items.length }
}
