import { useEffect, useState, type FormEvent } from 'react'
import type { PublicProduct } from '../../../shared/publicData'
import { computeSlotTimes } from '../../../shared/schedule'
import { parseSupplementDraft } from '../../../shared/supplementInput'
import {
  SLOT_LABELS,
  SLOTS,
  type IngredientDraft,
  type ScheduleDraft,
  type Slot,
  type Supplement,
  type SupplementDraft
} from '../../../shared/types'
import ProductSearch from './ProductSearch'

interface Props {
  /** 수정할 영양제. 없으면 새로 추가 */
  initial?: Supplement
  onSaved: () => void
  onCancel: () => void
}

const UNIT_SUGGESTIONS = ['mg', 'μg', 'g', 'IU', 'mL', '억 CFU', '%']

const emptyIngredient = (): IngredientDraft => ({ name: '', amount: '', unit: '' })

function toDraft(s?: Supplement): SupplementDraft {
  if (!s) return { name: '', manufacturer: '', labelInstruction: '', ingredients: [emptyIngredient()], schedule: [] }
  return {
    name: s.name,
    manufacturer: s.manufacturer,
    labelInstruction: s.labelInstruction,
    ingredients:
      s.ingredients.length > 0
        ? s.ingredients.map((i) => ({ name: i.name, amount: i.amount === null ? '' : String(i.amount), unit: i.unit }))
        : [emptyIngredient()],
    schedule: s.schedule.map((item) => ({ slot: item.slot, customTime: item.customTime ?? '', dose: item.dose }))
  }
}

// 영양제 추가·수정 입력 창 (화면 가운데 뜨는 대화상자)
export default function SupplementForm({ initial, onSaved, onCancel }: Props) {
  const [draft, setDraft] = useState<SupplementDraft>(() => toDraft(initial))
  const [errors, setErrors] = useState<string[]>([])
  /** 검색 결과로 채운 제품 (확인 안내·주의사항 표시용) */
  const [filledFrom, setFilledFrom] = useState<PublicProduct | null>(null)

  // 검색 결과로 채우기: 복용 시점은 사용자가 고른 그대로 둔다
  const fillFrom = (product: PublicProduct) => {
    setDraft((d) => ({
      ...product.draft,
      ingredients: product.draft.ingredients.length > 0 ? product.draft.ingredients : [emptyIngredient()],
      schedule: d.schedule
    }))
    setFilledFrom(product)
    setErrors([])
  }
  const [saving, setSaving] = useState(false)
  const [slotTimes, setSlotTimes] = useState<Record<Slot, string> | null>(null)

  useEffect(() => {
    void window.api.settings.get().then((settings) => setSlotTimes(computeSlotTimes(settings)))
  }, [])

  const setField = (field: 'name' | 'manufacturer' | 'labelInstruction', value: string) =>
    setDraft((d) => ({ ...d, [field]: value }))

  const setIngredient = (index: number, field: keyof IngredientDraft, value: string) =>
    setDraft((d) => ({
      ...d,
      ingredients: d.ingredients.map((ing, i) => (i === index ? { ...ing, [field]: value } : ing))
    }))

  const addIngredient = () => setDraft((d) => ({ ...d, ingredients: [...d.ingredients, emptyIngredient()] }))

  const removeIngredient = (index: number) =>
    setDraft((d) => ({ ...d, ingredients: d.ingredients.filter((_, i) => i !== index) }))

  const scheduleOf = (slot: Slot) => draft.schedule.find((item) => item.slot === slot)

  const toggleSlot = (slot: Slot, checked: boolean) =>
    setDraft((d) => ({
      ...d,
      schedule: checked
        ? [...d.schedule, { slot, customTime: '', dose: '' }]
        : d.schedule.filter((item) => item.slot !== slot)
    }))

  const setSchedule = (slot: Slot, field: 'customTime' | 'dose', value: string) =>
    setDraft((d) => ({
      ...d,
      schedule: d.schedule.map((item): ScheduleDraft => (item.slot === slot ? { ...item, [field]: value } : item))
    }))

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    // 화면에서 먼저 검사해 바로 알려준다 (메인 프로세스에서도 저장 직전에 한 번 더 검사)
    const parsed = parseSupplementDraft(draft)
    if (!parsed.ok) {
      setErrors(parsed.errors)
      return
    }
    setSaving(true)
    try {
      const result = initial
        ? await window.api.supplements.update(initial.id, draft)
        : await window.api.supplements.create(draft)
      if (result.ok) onSaved()
      else setErrors(result.errors)
    } catch {
      setErrors(['저장하지 못했습니다. 잠시 후 다시 시도해 주세요.'])
    } finally {
      setSaving(false)
    }
  }

  const inputClass =
    'w-full rounded-lg border border-slate-300 px-3 py-2 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200'

  return (
    <div className="fixed inset-0 z-10 flex items-center justify-center bg-black/40 p-4">
      <form
        onSubmit={(e) => void submit(e)}
        className="flex max-h-full w-full max-w-xl flex-col rounded-xl bg-white shadow-xl"
      >
        <h2 className="border-b border-slate-200 px-6 py-4 text-lg font-bold">
          {initial ? '영양제 수정' : '영양제 추가'}
        </h2>

        <div className="space-y-4 overflow-y-auto px-6 py-4">
          <ProductSearch onPick={fillFrom} />

          {filledFrom && (
            <div role="note" className="space-y-1 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900">
              <p>
                <b>공공데이터에서 가져왔습니다. 저장 전에 아래 내용이 실제 제품과 맞는지 확인하고 고쳐 주세요.</b>
              </p>
              <p>제조사 칸에는 판매 브랜드가 아니라 실제로 만든 업체(위탁 제조사)가 들어갈 수 있습니다.</p>
              {filledFrom.caution && (
                <details>
                  <summary className="cursor-pointer">섭취 시 주의사항 보기</summary>
                  <p className="mt-1 whitespace-pre-line text-amber-800">{filledFrom.caution}</p>
                </details>
              )}
            </div>
          )}

          <label className="block">
            <span className="text-sm font-medium">
              제품명 <span className="text-red-500">*</span>
            </span>
            <input
              autoFocus
              value={draft.name}
              onChange={(e) => setField('name', e.target.value)}
              placeholder="예: 알티지 오메가3"
              className={inputClass}
            />
          </label>

          <label className="block">
            <span className="text-sm font-medium">제조사</span>
            <input
              value={draft.manufacturer}
              onChange={(e) => setField('manufacturer', e.target.value)}
              placeholder="예: 종근당"
              className={inputClass}
            />
          </label>

          <label className="block">
            <span className="text-sm font-medium">제품에 적힌 섭취 방법</span>
            <textarea
              value={draft.labelInstruction}
              onChange={(e) => setField('labelInstruction', e.target.value)}
              placeholder="예: 1일 1회, 1회 1캡슐을 물과 함께 섭취"
              rows={2}
              className={inputClass}
            />
            <span className="text-xs text-slate-500">
              라벨에 섭취 방법이 적혀 있으면 복용 순서를 추천할 때 가장 먼저 따릅니다.
            </span>
          </label>

          <fieldset>
            <legend className="text-sm font-medium">성분</legend>
            <div className="mt-1 space-y-2">
              {draft.ingredients.map((ing, i) => (
                <div key={i} className="flex gap-2">
                  <input
                    value={ing.name}
                    onChange={(e) => setIngredient(i, 'name', e.target.value)}
                    placeholder="성분명 (예: 비타민 D)"
                    aria-label={`성분 ${i + 1} 이름`}
                    className={`${inputClass} flex-[3]`}
                  />
                  <input
                    value={ing.amount}
                    onChange={(e) => setIngredient(i, 'amount', e.target.value)}
                    placeholder="함량"
                    inputMode="decimal"
                    aria-label={`성분 ${i + 1} 함량`}
                    className={`${inputClass} flex-[1.5]`}
                  />
                  <input
                    value={ing.unit}
                    onChange={(e) => setIngredient(i, 'unit', e.target.value)}
                    placeholder="단위"
                    list="unit-suggestions"
                    aria-label={`성분 ${i + 1} 단위`}
                    className={`${inputClass} flex-[1.2]`}
                  />
                  <button
                    type="button"
                    onClick={() => removeIngredient(i)}
                    aria-label={`성분 ${i + 1} 삭제`}
                    className="shrink-0 rounded-lg px-2 text-slate-400 hover:bg-slate-100 hover:text-red-600"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
            <datalist id="unit-suggestions">
              {UNIT_SUGGESTIONS.map((u) => (
                <option key={u} value={u} />
              ))}
            </datalist>
            <button
              type="button"
              onClick={addIngredient}
              className="mt-2 text-sm font-medium text-indigo-600 hover:underline"
            >
              + 성분 추가
            </button>
          </fieldset>

          <fieldset>
            <legend className="text-sm font-medium">복용 시점</legend>
            <p className="text-xs text-slate-500">
              먹는 때를 모두 고르세요. 알람 시간은 설정의 생활 시간으로 계산되며, 이 영양제만 다른 시간에 먹으려면
              직접 지정하세요.
            </p>
            <div className="mt-2 space-y-1">
              {SLOTS.map((slot) => {
                const item = scheduleOf(slot)
                return (
                  <div
                    key={slot}
                    className={`flex flex-wrap items-center gap-2 rounded-lg px-3 py-2 ${item ? 'bg-indigo-50' : ''}`}
                  >
                    <label className="flex w-44 items-center gap-2">
                      <input type="checkbox" checked={!!item} onChange={(e) => toggleSlot(slot, e.target.checked)} />
                      <span className="text-sm">{SLOT_LABELS[slot]}</span>
                      <span className={`font-mono text-xs ${item?.customTime ? 'text-slate-400 line-through' : 'text-slate-500'}`}>
                        {slotTimes?.[slot]}
                      </span>
                    </label>
                    {item && (
                      <>
                        <input
                          value={item.dose}
                          onChange={(e) => setSchedule(slot, 'dose', e.target.value)}
                          placeholder="복용량 (예: 1캡슐)"
                          aria-label={`${SLOT_LABELS[slot]} 복용량`}
                          className={`${inputClass} w-36 py-1 text-sm`}
                        />
                        <label className="flex items-center gap-1 text-xs text-slate-500">
                          시간 직접 지정
                          <input
                            type="time"
                            value={item.customTime}
                            onChange={(e) => setSchedule(slot, 'customTime', e.target.value)}
                            aria-label={`${SLOT_LABELS[slot]} 직접 지정 시간`}
                            className={`${inputClass} w-auto py-1 text-sm`}
                          />
                        </label>
                      </>
                    )}
                  </div>
                )
              })}
            </div>
          </fieldset>

          {errors.length > 0 && (
            <ul role="alert" className="space-y-1 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
              {errors.map((e) => (
                <li key={e}>{e}</li>
              ))}
            </ul>
          )}
        </div>

        <div className="flex justify-end gap-2 border-t border-slate-200 px-6 py-4">
          <button type="button" onClick={onCancel} className="rounded-lg px-4 py-2 hover:bg-slate-100">
            취소
          </button>
          <button
            type="submit"
            disabled={saving}
            className="rounded-lg bg-indigo-600 px-5 py-2 font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
          >
            {saving ? '저장 중…' : '저장'}
          </button>
        </div>
      </form>
    </div>
  )
}
