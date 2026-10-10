// 설정 저장·조회. 항목마다 한 행(key, JSON value)이라 설정 항목이 늘어도 마이그레이션이 필요 없다.
import type { SqlDatabase } from './sql'
import { DEFAULT_SETTINGS, parseSettings } from '../../shared/schedule'
import type { Settings } from '../../shared/types'
import { withTransaction } from './transaction'

/** 저장된 설정. 저장된 적 없는 항목은 기본값으로 채운다 */
export function getSettings(db: SqlDatabase): Settings {
  const rows = db.prepare('SELECT key, value FROM settings').all() as unknown as { key: string; value: string }[]
  const stored: Record<string, unknown> = {}
  for (const row of rows) {
    try {
      stored[row.key] = JSON.parse(row.value)
    } catch {
      // 깨진 값은 무시하고 기본값을 쓴다
    }
  }
  const parsed = parseSettings({ ...DEFAULT_SETTINGS, ...stored })
  return parsed.ok ? parsed.value : DEFAULT_SETTINGS
}

/** 검사를 통과한 설정을 저장 */
export function saveSettings(db: SqlDatabase, settings: Settings): void {
  const upsert = db.prepare(
    'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value'
  )
  withTransaction(db, () => {
    for (const [key, value] of Object.entries(settings)) upsert.run(key, JSON.stringify(value))
  })
}
