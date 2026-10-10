// 화면에서 오는 제품 검색 요청(IPC). 건강기능식품(식품안전나라)과 일반의약품(공공데이터포털)을 동시에 찾는다.
// 외부 API는 메인 프로세스에서만 부른다.
import { ipcMain } from 'electron'
import { mergeSearchResults, type SupplementSearchResult } from '../shared/publicData'
import { searchOtcDrugs } from './services/drugInfo'
import { searchSupplements } from './services/foodSafety'

export function registerSearchHandlers(): void {
  ipcMain.handle('search:supplements', async (_event, name: unknown, manufacturer: unknown): Promise<SupplementSearchResult> => {
    const query = typeof name === 'string' ? name : ''
    if (!query.trim()) return { ok: false, error: '제품명을 입력해 주세요' }
    const maker = typeof manufacturer === 'string' ? manufacturer : ''
    const [healthFood, otcDrug] = await Promise.all([
      searchSupplements(query, maker, { apiKey: process.env.FOODSAFETY_API_KEY }),
      // 의약품 정보의 업체명은 판매사라 제조사 칸과 맞지 않을 수 있어 제품명으로만 찾는다
      searchOtcDrugs(query, { apiKey: process.env.DATA_GO_KR_API_KEY })
    ])
    return mergeSearchResults(healthFood, otcDrug)
  })
}
