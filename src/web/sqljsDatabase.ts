// 웹: sql.js(브라우저용 SQLite)를 공용 SqlDatabase 모양으로 감싼다.
// 그래서 데스크톱과 같은 SQL·마이그레이션·DB 함수를 그대로 쓴다.
import type { Database, SqlValue as SqlJsValue } from 'sql.js'
import type { SqlDatabase, SqlRunResult, SqlValue } from '../core/db/sql'

/** sql.js는 bigint를 받지 않으니 숫자로 바꿔 넘긴다 */
const toParams = (params: SqlValue[]): SqlJsValue[] =>
  params.map((p) => (typeof p === 'bigint' ? Number(p) : p)) as SqlJsValue[]

/**
 * @param onWrite 쓰기가 있었을 때 (브라우저 저장소에 저장하려고)
 */
export function wrapSqlJs(db: Database, onWrite: () => void = () => {}): SqlDatabase {
  return {
    prepare: (sql) => ({
      run: (...params): SqlRunResult => {
        const stmt = db.prepare(sql)
        try {
          stmt.run(toParams(params))
        } finally {
          stmt.free()
        }
        const changes = db.getRowsModified()
        const lastInsertRowid = Number(db.exec('SELECT last_insert_rowid()')[0]?.values[0]?.[0] ?? 0)
        onWrite()
        return { changes, lastInsertRowid }
      },
      get: (...params) => {
        const stmt = db.prepare(sql)
        try {
          stmt.bind(toParams(params))
          return stmt.step() ? stmt.getAsObject() : undefined
        } finally {
          stmt.free()
        }
      },
      all: (...params) => {
        const stmt = db.prepare(sql)
        try {
          stmt.bind(toParams(params))
          const rows: unknown[] = []
          while (stmt.step()) rows.push(stmt.getAsObject())
          return rows
        } finally {
          stmt.free()
        }
      }
    }),
    exec: (sql) => {
      db.exec(sql)
      onWrite()
    },
    close: () => db.close()
  }
}

/**
 * DB를 바이트로 내보낸다 (브라우저 저장·백업 파일용).
 * 주의: sql.js의 export()는 DB를 다시 열면서 PRAGMA를 기본값으로 되돌리므로 외래키를 다시 켠다.
 */
export function exportDatabase(db: Database): Uint8Array {
  const bytes = db.export()
  db.exec('PRAGMA foreign_keys = ON')
  return bytes
}
