// 식품안전나라 오픈API: 건강기능식품 품목제조 신고사항(I0030) 검색. 메인 프로세스에서만 호출한다.
// 인증키는 .env의 FOODSAFETY_API_KEY (식품안전나라 > 오픈API에서 신청). 'sample'은 개발용 견본 키(최대 5건).
import { toPublicProduct, type I0030Row, type SupplementSearchResult } from '../../shared/publicData'

const BASE_URL = 'https://openapi.foodsafetykorea.go.kr/api'
const SERVICE_ID = 'I0030'
const MAX_RESULTS = 20
const TIMEOUT_MS = 10_000

interface I0030Response {
  I0030?: {
    total_count?: string
    row?: I0030Row[]
    RESULT?: { CODE?: string; MSG?: string }
  }
}

export interface SearchOptions {
  apiKey: string | undefined
  /** 테스트에서 가짜 응답을 넣기 위해 */
  fetchImpl?: typeof fetch
}

/** 요청 주소. 검색어는 주소 경로에 '항목=값' 형태로 붙는다 */
export function buildSearchUrl(apiKey: string, name: string, manufacturer: string): string {
  const filters = [`PRDLST_NM=${encodeURIComponent(name)}`]
  if (manufacturer) filters.push(`BSSH_NM=${encodeURIComponent(manufacturer)}`)
  return `${BASE_URL}/${encodeURIComponent(apiKey)}/${SERVICE_ID}/json/1/${MAX_RESULTS}/${filters.join('&')}`
}

/** 제품명(필수)·제조사(선택)로 검색. 실패해도 예외 대신 사용자에게 보여줄 문구를 돌려준다 */
export async function searchSupplements(
  name: string,
  manufacturer: string,
  { apiKey, fetchImpl = fetch }: SearchOptions
): Promise<SupplementSearchResult> {
  const query = name.trim()
  if (!query) return { ok: false, error: '제품명을 입력해 주세요' }
  if (!apiKey) {
    return { ok: false, error: '식품안전나라 API 키가 설정되지 않았습니다. 직접 입력해 주세요.' }
  }

  let body: I0030Response
  try {
    const response = await fetchImpl(buildSearchUrl(apiKey, query, manufacturer.trim()), {
      signal: AbortSignal.timeout(TIMEOUT_MS)
    })
    if (!response.ok) return { ok: false, error: `검색 서버 오류 (${response.status}). 잠시 후 다시 시도하거나 직접 입력해 주세요.` }
    body = (await response.json()) as I0030Response
  } catch {
    return { ok: false, error: '검색하지 못했습니다. 인터넷 연결을 확인하거나 직접 입력해 주세요.' }
  }

  const data = body.I0030
  const code = data?.RESULT?.CODE
  if (code === 'INFO-200') return { ok: true, items: [], total: 0 } // 해당하는 데이터가 없음
  if (code === 'INFO-100') return { ok: false, error: '식품안전나라 API 키가 올바르지 않습니다. .env의 키를 확인해 주세요.' }
  if (code !== 'INFO-000' || !data) {
    return { ok: false, error: `검색 서버 응답 오류: ${data?.RESULT?.MSG ?? '알 수 없음'}` }
  }
  const items = (data.row ?? []).map(toPublicProduct)
  return { ok: true, items, total: Number(data.total_count) || items.length }
}
