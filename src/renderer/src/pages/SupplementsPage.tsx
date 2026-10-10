import { useCallback, useEffect, useState } from 'react'
import type { Ingredient, Supplement } from '../../../shared/types'
import SupplementForm from '../components/SupplementForm'

/** 입력 창 상태: 닫힘 / 새로 추가 / 수정 */
type Editing = null | { mode: 'create' } | { mode: 'edit'; supplement: Supplement }

export default function SupplementsPage() {
  const [supplements, setSupplements] = useState<Supplement[] | null>(null)
  const [editing, setEditing] = useState<Editing>(null)

  const reload = useCallback(async () => {
    setSupplements(await window.api.supplements.list())
  }, [])

  useEffect(() => {
    void reload()
  }, [reload])

  const toggleActive = async (s: Supplement) => {
    await window.api.supplements.setActive(s.id, !s.active)
    await reload()
  }

  const remove = async (s: Supplement) => {
    if (!window.confirm(`'${s.name}'을(를) 삭제할까요?\n삭제하면 되돌릴 수 없습니다.`)) return
    await window.api.supplements.remove(s.id)
    await reload()
  }

  const onSaved = async () => {
    setEditing(null)
    await reload()
  }

  return (
    <div className="mx-auto max-w-3xl p-6">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-bold">영양제 목록</h1>
        <button
          type="button"
          onClick={() => setEditing({ mode: 'create' })}
          className="rounded-lg bg-indigo-600 px-4 py-2 font-semibold text-white hover:bg-indigo-700"
        >
          + 영양제 추가
        </button>
      </div>

      {supplements === null ? null : supplements.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white p-10 text-center text-slate-500">
          아직 등록한 영양제가 없습니다.
          <br />
          오른쪽 위 <b>+ 영양제 추가</b>를 눌러 먹고 있는 영양제를 입력해 보세요.
        </div>
      ) : (
        <ul className="space-y-3">
          {supplements.map((s) => (
            <li
              key={s.id}
              className={`rounded-xl border border-slate-200 bg-white p-4 ${s.active ? '' : 'opacity-60'}`}
            >
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-baseline gap-2">
                    <h2 className="text-lg font-semibold">{s.name}</h2>
                    {s.manufacturer && <span className="text-sm text-slate-500">{s.manufacturer}</span>}
                    {!s.active && (
                      <span className="rounded bg-slate-200 px-2 py-0.5 text-xs text-slate-600">사용 중지</span>
                    )}
                  </div>
                  {s.ingredients.length > 0 && (
                    <p className="mt-1 text-sm text-slate-600">{s.ingredients.map(formatIngredient).join(' · ')}</p>
                  )}
                  {s.labelInstruction && (
                    <p className="mt-1 text-sm text-slate-500">섭취 방법: {s.labelInstruction}</p>
                  )}
                </div>
                <div className="flex shrink-0 gap-1 text-sm">
                  <button
                    type="button"
                    onClick={() => setEditing({ mode: 'edit', supplement: s })}
                    className="rounded px-2 py-1 text-indigo-600 hover:bg-indigo-50"
                  >
                    수정
                  </button>
                  <button
                    type="button"
                    onClick={() => void toggleActive(s)}
                    className="rounded px-2 py-1 text-slate-600 hover:bg-slate-100"
                  >
                    {s.active ? '사용 중지' : '다시 사용'}
                  </button>
                  <button
                    type="button"
                    onClick={() => void remove(s)}
                    className="rounded px-2 py-1 text-red-600 hover:bg-red-50"
                  >
                    삭제
                  </button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}

      {editing && (
        <SupplementForm
          initial={editing.mode === 'edit' ? editing.supplement : undefined}
          onSaved={() => void onSaved()}
          onCancel={() => setEditing(null)}
        />
      )}
    </div>
  )
}

function formatIngredient(i: Ingredient): string {
  if (i.amount === null) return i.name
  return `${i.name} ${i.amount.toLocaleString('ko-KR')}${i.unit}`
}
