import type { DatabaseSync } from 'node:sqlite'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { openDatabase } from '../src/main/db/connection'
import { MIGRATIONS, migrate } from '../src/main/db/migrations'
import {
  createSupplement,
  deleteSupplement,
  getSupplement,
  listSupplements,
  setSupplementActive,
  updateSupplement
} from '../src/main/db/supplements'
import type { SupplementInput } from '../src/shared/types'

const omega3: SupplementInput = {
  name: '오메가3',
  manufacturer: '종근당',
  labelInstruction: '1일 1회, 1회 1캡슐 식후 섭취',
  ingredients: [
    { name: 'EPA 및 DHA 함유 유지', amount: 600, unit: 'mg' },
    { name: '비타민 E', amount: null, unit: '' }
  ],
  schedule: [
    { slot: 'breakfast', customTime: null, dose: '1캡슐' },
    { slot: 'dinner', customTime: '19:30', dose: '' }
  ]
}

let db: DatabaseSync

beforeEach(() => {
  db = openDatabase(':memory:')
})

afterEach(() => {
  db.close()
})

describe('마이그레이션', () => {
  it('최신 버전까지 적용된다', () => {
    const { user_version } = db.prepare('PRAGMA user_version').get() as { user_version: number }
    expect(user_version).toBe(MIGRATIONS.length)
  })

  it('다시 실행해도 데이터가 그대로 남는다', () => {
    createSupplement(db, omega3)
    migrate(db)
    expect(listSupplements(db)).toHaveLength(1)
  })
})

describe('영양제 저장', () => {
  it('성분과 함께 저장하고 다시 읽는다', () => {
    const now = new Date('2026-10-10T03:00:00.000Z')
    const saved = createSupplement(db, omega3, 'manual', now)

    expect(saved).toEqual({
      id: saved.id,
      ...omega3,
      source: 'manual',
      active: true,
      createdAt: '2026-10-10T03:00:00.000Z'
    })
    expect(getSupplement(db, saved.id)).toEqual(saved)
  })

  it('목록은 사용 중인 것 먼저, 그다음 이름순', () => {
    const a = createSupplement(db, { ...omega3, name: '비타민D' })
    createSupplement(db, { ...omega3, name: '마그네슘' })
    createSupplement(db, { ...omega3, name: '아연' })
    setSupplementActive(db, a.id, false)

    expect(listSupplements(db).map((s) => [s.name, s.active])).toEqual([
      ['마그네슘', true],
      ['아연', true],
      ['비타민D', false]
    ])
  })

  it('수정하면 성분·복용 시점 목록이 통째로 바뀐다', () => {
    const saved = createSupplement(db, omega3)
    const updated = updateSupplement(db, saved.id, {
      ...omega3,
      name: '알티지 오메가3',
      ingredients: [{ name: 'EPA', amount: 300, unit: 'mg' }],
      schedule: [{ slot: 'lunch', customTime: null, dose: '2캡슐' }]
    })

    expect(updated?.name).toBe('알티지 오메가3')
    expect(updated?.ingredients).toEqual([{ name: 'EPA', amount: 300, unit: 'mg' }])
    expect(updated?.schedule).toEqual([{ slot: 'lunch', customTime: null, dose: '2캡슐' }])
    expect(updated?.createdAt).toBe(saved.createdAt)
  })

  it('없는 id를 수정하면 null', () => {
    expect(updateSupplement(db, 999, omega3)).toBeNull()
  })

  it('사용 중지했다가 다시 켤 수 있다', () => {
    const saved = createSupplement(db, omega3)
    setSupplementActive(db, saved.id, false)
    expect(getSupplement(db, saved.id)?.active).toBe(false)
    setSupplementActive(db, saved.id, true)
    expect(getSupplement(db, saved.id)?.active).toBe(true)
  })

  it('삭제하면 성분도 함께 지워진다', () => {
    const saved = createSupplement(db, omega3)
    const other = createSupplement(db, { ...omega3, name: '비타민D' })
    deleteSupplement(db, saved.id)

    expect(getSupplement(db, saved.id)).toBeNull()
    const { count } = db.prepare('SELECT COUNT(*) AS count FROM ingredients WHERE product_id = ?').get(saved.id) as {
      count: number
    }
    expect(count).toBe(0)
    expect(getSupplement(db, other.id)?.ingredients).toHaveLength(2)
  })

  it('저장 중 오류가 나면 제품도 저장되지 않는다', () => {
    const broken = { ...omega3, ingredients: [{ name: null, amount: 1, unit: 'mg' }] } as unknown as SupplementInput
    expect(() => createSupplement(db, broken)).toThrow()
    expect(listSupplements(db)).toHaveLength(0)
  })
})
