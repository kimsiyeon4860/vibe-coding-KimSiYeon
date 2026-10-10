// 영양제 저장·조회. DB를 인자로 받아 테스트에서 메모리 DB로 검증할 수 있게 한다.
import type { DatabaseSync } from 'node:sqlite'
import type { Ingredient, ProductSource, Supplement, SupplementInput } from '../../shared/types'
import { withTransaction } from './transaction'

interface ProductRow {
  id: number
  name: string
  manufacturer: string
  label_instruction: string
  source: ProductSource
  active: number
  created_at: string
}

interface IngredientRow {
  product_id: number
  name: string
  amount: number | null
  unit: string
}

const PRODUCT_COLUMNS = 'id, name, manufacturer, label_instruction, source, active, created_at'

/** 영양제 전체. 사용 중인 것 먼저, 그다음 이름순 */
export function listSupplements(db: DatabaseSync): Supplement[] {
  const products = db
    .prepare(
      `SELECT ${PRODUCT_COLUMNS} FROM products
       WHERE type = 'supplement'
       ORDER BY active DESC, name`
    )
    .all() as unknown as ProductRow[]

  const ingredientRows = db
    .prepare(
      `SELECT i.product_id, i.name, i.amount, i.unit FROM ingredients i
       JOIN products p ON p.id = i.product_id
       WHERE p.type = 'supplement'
       ORDER BY i.id`
    )
    .all() as unknown as IngredientRow[]

  const byProduct = new Map<number, Ingredient[]>()
  for (const row of ingredientRows) {
    const list = byProduct.get(row.product_id) ?? []
    list.push(toIngredient(row))
    byProduct.set(row.product_id, list)
  }
  return products.map((p) => toSupplement(p, byProduct.get(p.id) ?? []))
}

export function getSupplement(db: DatabaseSync, id: number): Supplement | null {
  const product = db
    .prepare(`SELECT ${PRODUCT_COLUMNS} FROM products WHERE id = ? AND type = 'supplement'`)
    .get(id) as unknown as ProductRow | undefined
  if (!product) return null

  const rows = db
    .prepare('SELECT product_id, name, amount, unit FROM ingredients WHERE product_id = ? ORDER BY id')
    .all(id) as unknown as IngredientRow[]
  return toSupplement(product, rows.map(toIngredient))
}

export function createSupplement(
  db: DatabaseSync,
  input: SupplementInput,
  source: ProductSource = 'manual',
  now: Date = new Date()
): Supplement {
  const id = withTransaction(db, () => {
    const result = db
      .prepare(
        `INSERT INTO products (type, name, manufacturer, label_instruction, source, active, created_at)
         VALUES ('supplement', ?, ?, ?, ?, 1, ?)`
      )
      .run(input.name, input.manufacturer, input.labelInstruction, source, now.toISOString())
    const productId = Number(result.lastInsertRowid)
    insertIngredients(db, productId, input.ingredients)
    return productId
  })
  return getSupplement(db, id)!
}

/** 수정. 성분은 통째로 새 목록으로 바꾼다. 없는 id면 null */
export function updateSupplement(db: DatabaseSync, id: number, input: SupplementInput): Supplement | null {
  const updated = withTransaction(db, () => {
    const result = db
      .prepare(
        `UPDATE products SET name = ?, manufacturer = ?, label_instruction = ?
         WHERE id = ? AND type = 'supplement'`
      )
      .run(input.name, input.manufacturer, input.labelInstruction, id)
    if (result.changes === 0) return false
    db.prepare('DELETE FROM ingredients WHERE product_id = ?').run(id)
    insertIngredients(db, id, input.ingredients)
    return true
  })
  return updated ? getSupplement(db, id) : null
}

export function setSupplementActive(db: DatabaseSync, id: number, active: boolean): void {
  db.prepare(`UPDATE products SET active = ? WHERE id = ? AND type = 'supplement'`).run(active ? 1 : 0, id)
}

/** 완전히 삭제. 성분은 외래키(ON DELETE CASCADE)로 함께 지워진다 */
export function deleteSupplement(db: DatabaseSync, id: number): void {
  db.prepare(`DELETE FROM products WHERE id = ? AND type = 'supplement'`).run(id)
}

function insertIngredients(db: DatabaseSync, productId: number, ingredients: Ingredient[]): void {
  const insert = db.prepare('INSERT INTO ingredients (product_id, name, amount, unit) VALUES (?, ?, ?, ?)')
  for (const ing of ingredients) insert.run(productId, ing.name, ing.amount, ing.unit)
}

function toIngredient(row: IngredientRow): Ingredient {
  return { name: row.name, amount: row.amount, unit: row.unit }
}

function toSupplement(row: ProductRow, ingredients: Ingredient[]): Supplement {
  return {
    id: row.id,
    name: row.name,
    manufacturer: row.manufacturer,
    labelInstruction: row.label_instruction,
    source: row.source,
    active: row.active === 1,
    createdAt: row.created_at,
    ingredients
  }
}
