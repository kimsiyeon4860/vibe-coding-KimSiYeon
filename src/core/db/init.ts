import { migrate } from './migrations'
import type { SqlDatabase } from './sql'

/** 새로 연 DB에 공통 설정을 하고 스키마를 최신으로 맞춘다 (데스크톱·웹 공통) */
export function initDatabase(db: SqlDatabase): SqlDatabase {
  db.exec('PRAGMA foreign_keys = ON') // 제품을 지우면 성분·일정·기록도 함께 지워지도록
  migrate(db)
  return db
}
