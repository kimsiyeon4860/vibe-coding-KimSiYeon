import type { DatabaseSync } from 'node:sqlite'
import { withTransaction } from './transaction'

/**
 * 스키마 변경 목록. 배열의 n번째(0부터)가 버전 n+1.
 * 규칙: 이미 배포된 항목은 절대 고치지 말고, 바꿀 내용이 있으면 끝에 새 항목을 추가한다.
 */
export const MIGRATIONS: readonly string[] = [
  // 1: 제품과 성분 (로드맵 2단계)
  `
  CREATE TABLE products (
    id                INTEGER PRIMARY KEY AUTOINCREMENT,
    type              TEXT    NOT NULL CHECK (type IN ('supplement', 'prescription')),
    name              TEXT    NOT NULL,
    manufacturer      TEXT    NOT NULL DEFAULT '',
    label_instruction TEXT    NOT NULL DEFAULT '',
    source            TEXT    NOT NULL DEFAULT 'manual'
                              CHECK (source IN ('manual', 'public_data', 'web_search', 'photo')),
    image_path        TEXT,
    active            INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
    created_at        TEXT    NOT NULL
  );

  CREATE TABLE ingredients (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    name       TEXT    NOT NULL,
    amount     REAL,
    unit       TEXT    NOT NULL DEFAULT ''
  );

  CREATE INDEX idx_ingredients_product ON ingredients(product_id);
  `
]

/** DB의 user_version을 보고 아직 적용되지 않은 마이그레이션만 순서대로 실행한다 */
export function migrate(db: DatabaseSync): void {
  const row = db.prepare('PRAGMA user_version').get() as { user_version: number }
  for (let version = row.user_version; version < MIGRATIONS.length; version++) {
    withTransaction(db, () => {
      db.exec(MIGRATIONS[version])
      db.exec(`PRAGMA user_version = ${version + 1}`)
    })
  }
}
