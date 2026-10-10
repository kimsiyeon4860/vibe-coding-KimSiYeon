// 영양제 입력값 검사 (순수 함수). 화면 입력 창과 메인 프로세스 저장 직전에 함께 쓴다.
import type { Ingredient, SupplementInput } from './types'

export const NAME_MAX = 100
export const INSTRUCTION_MAX = 1000

export type ParseResult<T> = { ok: true; value: T } | { ok: false; errors: string[] }

/**
 * 입력 창 값(SupplementDraft 형태)을 검사해 저장 가능한 값으로 바꾼다.
 * IPC로 넘어온 값도 그대로 믿지 않도록 unknown으로 받는다.
 */
export function parseSupplementDraft(raw: unknown): ParseResult<SupplementInput> {
  if (!isRecord(raw)) return { ok: false, errors: ['입력값 형식이 올바르지 않습니다'] }

  const errors: string[] = []
  const name = text(raw.name)
  const manufacturer = text(raw.manufacturer)
  const labelInstruction = text(raw.labelInstruction)

  if (!name) errors.push('제품명을 입력해 주세요')
  else if (name.length > NAME_MAX) errors.push(`제품명은 ${NAME_MAX}자 이하로 입력해 주세요`)
  if (manufacturer.length > NAME_MAX) errors.push(`제조사는 ${NAME_MAX}자 이하로 입력해 주세요`)
  if (labelInstruction.length > INSTRUCTION_MAX) {
    errors.push(`섭취 방법은 ${INSTRUCTION_MAX}자 이하로 입력해 주세요`)
  }

  const ingredients: Ingredient[] = []
  const rows = Array.isArray(raw.ingredients) ? raw.ingredients : []
  rows.forEach((row: unknown, index) => {
    const label = `성분 ${index + 1}`
    if (!isRecord(row)) {
      errors.push(`${label}: 형식이 올바르지 않습니다`)
      return
    }
    const ingName = text(row.name)
    const amountText = text(row.amount).replaceAll(',', '')
    const unit = text(row.unit)

    // 완전히 빈 행은 무시
    if (!ingName && !amountText && !unit) return

    if (!ingName) errors.push(`${label}: 성분명을 입력해 주세요`)
    else if (ingName.length > NAME_MAX) errors.push(`${label}: 성분명은 ${NAME_MAX}자 이하로 입력해 주세요`)

    let amount: number | null = null
    if (amountText) {
      amount = Number(amountText)
      if (!Number.isFinite(amount) || amount < 0) {
        errors.push(`${label}: 함량은 0 이상의 숫자로 입력해 주세요`)
      }
    }
    ingredients.push({ name: ingName, amount, unit })
  })

  if (errors.length > 0) return { ok: false, errors }
  return { ok: true, value: { name, manufacturer, labelInstruction, ingredients } }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** 문자열·숫자만 받아 앞뒤 공백을 지운다. 그 외는 빈 문자열 */
function text(value: unknown): string {
  if (typeof value === 'string') return value.trim()
  if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  return ''
}
