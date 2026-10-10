// 데스크톱(node:sqlite)과 웹(sql.js)이 함께 쓰는 최소 DB 인터페이스.
// node:sqlite의 SqlDatabase는 그대로 이 모양을 만족하고, 웹은 src/web/sqljsDatabase.ts가 맞춰 준다.

export type SqlValue = string | number | bigint | null | Uint8Array

export interface SqlRunResult {
  changes: number | bigint
  lastInsertRowid: number | bigint
}

export interface SqlStatement {
  run(...params: SqlValue[]): SqlRunResult
  /** 첫 행 (없으면 undefined) */
  get(...params: SqlValue[]): unknown
  all(...params: SqlValue[]): unknown[]
}

export interface SqlDatabase {
  prepare(sql: string): SqlStatement
  exec(sql: string): void
  close(): void
}
