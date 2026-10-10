// 설정 탭의 앱 정보 요청(IPC): 검색 API 키 상태, .env 폴더 열기
import { dirname } from 'node:path'
import { app, ipcMain, shell } from 'electron'
import type { EnvInfo } from '../shared/types'
import { envFilePath } from './env'

export function registerAppHandlers(): void {
  ipcMain.handle('app:env-info', (): EnvInfo => {
    const key = process.env.FOODSAFETY_API_KEY ?? ''
    return {
      hasSearchKey: key !== '',
      isSampleKey: key === 'sample',
      hasDrugKey: (process.env.DATA_GO_KR_API_KEY ?? '') !== '',
      envPath: envFilePath(),
      isPackaged: app.isPackaged
    }
  })

  ipcMain.handle('app:open-env-folder', async () => {
    await shell.openPath(dirname(envFilePath()))
  })
}
