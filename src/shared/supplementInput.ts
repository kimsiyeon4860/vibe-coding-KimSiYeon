// 영양제 입력값 검사 (순수 함수). 화면 입력 창과 메인 프로세스 저장 직전에 함께 쓴다.
import { formatHm, parseHm } from './schedule'
import { SLOT_LABELS, SLOTS, type Ingredient, type ParseResult, type ScheduleItem, type Slot, type SupplementInput } from './types'

export const NAME_MAX = 100
export const INSTRUCTION_MAX = 1000
export const DOSE_MAX = 50

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

  const schedule = parseSchedule(raw.schedule, errors)

  if (errors.length > 0) return { ok: false, errors }
  const value: SupplementInput = { name, manufacturer, labelInstruction, ingredients, schedule }
  // 화면에서 올 수 있는 출처는 직접 입력과 공공데이터 검색뿐
  if (raw.source === 'public_data') value.source = 'public_data'
  return { ok: true, value }
}

/** 복용 시점 목록 검사. 슬롯 순서로 정렬해 돌려준다 (처방약 입력 검사도 쓴다) */
export function parseSchedule(raw: unknown, errors: string[]): ScheduleItem[] {
  const rows = Array.isArray(raw) ? raw : []
  const bySlot = new Map<Slot, ScheduleItem>()
  for (const row of rows) {
    if (!isRecord(row) || !SLOTS.includes(row.slot as Slot)) {
      errors.push('복용 시점 형식이 올바르지 않습니다')
      continue
    }
    const slot = row.slot as Slot
    const label = SLOT_LABELS[slot]
    const dose = text(row.dose)
    const timeText = text(row.customTime)

    let customTime: string | null = null
    if (timeText) {
      const minutes = parseHm(timeText)
      if (minutes === null) errors.push(`${label}: 시간을 확인해 주세요`)
      else customTime = formatHm(minutes)
    }
    if (dose.length > DOSE_MAX) errors.push(`${label}: 복용량은 ${DOSE_MAX}자 이하로 입력해 주세요`)
    // 같은 슬롯이 두 번 오면 마지막 값을 쓴다
    bySlot.set(slot, { slot, customTime, dose })
  }
  return SLOTS.filter((s) => bySlot.has(s)).map((s) => bySlot.get(s)!)
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** 문자열·숫자만 받아 앞뒤 공백을 지운다. 그 외는 빈 문자열 */
export function text(value: unknown): string {
  if (typeof value === 'string') return value.trim()
  if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  return ''
}
