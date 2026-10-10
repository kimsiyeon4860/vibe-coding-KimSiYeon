// 화면에서 오는 제품 검색 요청(IPC). 외부 API는 메인 프로세스에서만 부른다.
import { ipcMain } from 'electron'
import type { SupplementSearchResult } from '../shared/publicData'
import { searchSupplements } from './services/foodSafety'

export function registerSearchHandlers(): void {
  ipcMain.handle(
    'search:supplements',
    (_event, name: unknown, manufacturer: unknown): Promise<SupplementSearchResult> =>
      searchSupplements(typeof name === 'string' ? name : '', typeof manufacturer === 'string' ? manufacturer : '', {
        apiKey: process.env.FOODSAFETY_API_KEY
      })
  )
}
