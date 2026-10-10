import { DatabaseSync } from 'node:sqlite'
import { migrate } from './migrations'

/**
 * SQLite DB를 열고 스키마를 최신으로 맞춘다.
 * Node에 내장된 node:sqlite를 쓰므로 별도 설치·재빌드가 필요 없다.
 * @param path 파일 경로. 테스트에서는 ':memory:'
 */
export function openDatabase(path: string): DatabaseSync {
  const db = new DatabaseSync(path)
  db.exec('PRAGMA journal_mode = WAL') // 쓰는 중에 앱이 꺼져도 DB가 깨지지 않게
  db.exec('PRAGMA foreign_keys = ON') // 제품을 지우면 성분도 함께 지워지도록
  migrate(db)
  return db
}
