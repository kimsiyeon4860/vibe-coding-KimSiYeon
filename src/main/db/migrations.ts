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
  `,

  // 2: 설정, 복용 시점, 복용 기록 (로드맵 3-1단계)
  `
  CREATE TABLE settings (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL  -- JSON
  );

  CREATE TABLE schedule_items (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    product_id  INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    slot        TEXT    NOT NULL CHECK (slot IN ('wake', 'breakfast', 'lunch', 'dinner', 'bedtime')),
    custom_time TEXT,             -- "HH:mm", 없으면 슬롯 시간
    dose        TEXT    NOT NULL DEFAULT '',
    sort_order  INTEGER NOT NULL DEFAULT 0,
    UNIQUE (product_id, slot)
  );

  -- 일정(schedule_items)을 바꿔도 과거 기록이 남도록 제품·슬롯·예정 시각을 직접 저장한다
  CREATE TABLE intake_logs (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    product_id   INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    slot         TEXT    NOT NULL,
    plan_date    TEXT    NOT NULL,  -- 복용일 "yyyy-MM-dd"
    scheduled_at TEXT    NOT NULL,  -- ISO 8601 (+09:00)
    action       TEXT    NOT NULL CHECK (action IN ('taken', 'snoozed', 'skipped', 'missed')),
    acted_at     TEXT    NOT NULL   -- ISO 8601
  );

  CREATE INDEX idx_intake_logs_plan_date ON intake_logs(plan_date);
  `,

  // 3: 처방약 (로드맵 4단계) + 복용 시점 등록 시각
  `
  CREATE TABLE prescriptions (
    product_id          INTEGER PRIMARY KEY REFERENCES products(id) ON DELETE CASCADE,
    meal_timing         TEXT    NOT NULL CHECK (meal_timing IN ('before', 'after')),
    meal_offset_minutes INTEGER NOT NULL,
    start_date          TEXT    NOT NULL,  -- 복용일 "yyyy-MM-dd"
    days                INTEGER,           -- NULL = 계속 복용
    memo                TEXT    NOT NULL DEFAULT ''
  );

  -- 이보다 이른 예정 시각은 알람을 울리지 않는다 (등록 전에 이미 지난 시간). 기존 행은 아주 옛날로 둔다
  ALTER TABLE schedule_items ADD COLUMN created_at TEXT NOT NULL DEFAULT '1970-01-01T00:00:00.000Z';
  `,

  // 4: 생활 기록 — 클릭으로 기록한 기상·식사·취침 (로드맵 8-1단계)
  `
  CREATE TABLE life_events (
    plan_date TEXT NOT NULL,  -- 복용일 "yyyy-MM-dd"
    event     TEXT NOT NULL CHECK (event IN ('wake', 'breakfast', 'lunch', 'dinner', 'bed')),
    at        TEXT NOT NULL,  -- ISO 8601
    PRIMARY KEY (plan_date, event)
  );
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
