import { useState, type FormEvent } from 'react'
import { parseSupplementDraft } from '../../../shared/supplementInput'
import type { IngredientDraft, Supplement, SupplementDraft } from '../../../shared/types'

interface Props {
  /** 수정할 영양제. 없으면 새로 추가 */
  initial?: Supplement
  onSaved: () => void
  onCancel: () => void
}

const UNIT_SUGGESTIONS = ['mg', 'μg', 'g', 'IU', 'mL', '억 CFU', '%']

const emptyIngredient = (): IngredientDraft => ({ name: '', amount: '', unit: '' })

function toDraft(s?: Supplement): SupplementDraft {
  if (!s) return { name: '', manufacturer: '', labelInstruction: '', ingredients: [emptyIngredient()] }
  return {
    name: s.name,
    manufacturer: s.manufacturer,
    labelInstruction: s.labelInstruction,
    ingredients:
      s.ingredients.length > 0
        ? s.ingredients.map((i) => ({ name: i.name, amount: i.amount === null ? '' : String(i.amount), unit: i.unit }))
        : [emptyIngredient()]
  }
}

// 영양제 추가·수정 입력 창 (화면 가운데 뜨는 대화상자)
export default function SupplementForm({ initial, onSaved, onCancel }: Props) {
  const [draft, setDraft] = useState<SupplementDraft>(() => toDraft(initial))
  const [errors, setErrors] = useState<string[]>([])
  const [saving, setSaving] = useState(false)

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
