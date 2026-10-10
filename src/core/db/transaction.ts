import type { SqlDatabase } from './sql'

/** fn 안의 쓰기를 한 묶음으로 처리. 중간에 오류가 나면 모두 취소한다 */
export function withTransaction<T>(db: SqlDatabase, fn: () => T): T {
  db.exec('BEGIN')
  try {
    const result = fn()
    db.exec('COMMIT')
    return result
  } catch (error) {
    db.exec('ROLLBACK')
    throw error
  }
}
