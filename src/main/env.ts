// .env 읽기 (API 키는 코드·git이 아니라 .env에만 둔다 — CLAUDE.md 원칙 4)
// 개발: 프로젝트 폴더의 .env / 설치한 앱: %APPDATA%\PillMate\.env
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { app } from 'electron'

/** 앱이 읽는 .env 경로 */
export function envFilePath(): string {
  return app.isPackaged ? join(app.getPath('userData'), '.env') : join(process.cwd(), '.env')
}

export function loadEnv(): void {
  const path = envFilePath()
  if (!existsSync(path)) return
  try {
    process.loadEnvFile(path)
  } catch (error) {
    console.error('[.env] 읽지 못했습니다', error)
  }
}
