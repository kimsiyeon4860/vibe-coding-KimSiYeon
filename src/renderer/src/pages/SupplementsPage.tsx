import { useCallback, useEffect, useState } from 'react'
import { findConflicts, placeDoses } from '../../../shared/recommend'
import { SLOT_LABELS, type Ingredient, type Settings, type Supplement } from '../../../shared/types'
import RecommendBoard from '../components/RecommendBoard'
import SupplementForm from '../components/SupplementForm'

/** 입력 창 상태: 닫힘 / 새로 추가 / 수정 */
type Editing = null | { mode: 'create' } | { mode: 'edit'; supplement: Supplement }

export default function SupplementsPage() {
  const [supplements, setSupplements] = useState<Supplement[] | null>(null)
  const [editing, setEditing] = useState<Editing>(null)
  const [settings, setSettings] = useState<Settings | null>(null)
  const [recommending, setRecommending] = useState(false)

  const reload = useCallback(async () => {
    const [list, s] = await Promise.all([window.api.supplements.list(), window.api.settings.get()])
    setSupplements(list)
    setSettings(s)
  }, [])

  useEffect(() => {
    void reload()
  }, [reload])

  const toggleActive = async (s: Supplement) => {
    await window.api.supplements.setActive(s.id, !s.active)
    await reload()
  }

  const remove = async (s: Supplement) => {
    const message =
      `'${s.name}'을(를) 삭제할까요?\n` +
      '복용 기록도 함께 지워지며 되돌릴 수 없습니다.\n' +
      "기록을 남기려면 '사용 중지'를 쓰세요."
    if (!window.confirm(message)) return
    await window.api.supplements.remove(s.id)
    await reload()
  }

  const onSaved = async () => {
    setEditing(null)
    await reload()
  }

  if (recommending && supplements && settings) {
    return (
      <RecommendBoard
        supplements={supplements}
        settings={settings}
        onClose={() => setRecommending(false)}
        onApplied={() => {
          setRecommending(false)
          void reload()
        }}
      />
    )
  }

  // 지금 일정에서 함께 먹으면 안 좋은 조합이 가까이 있는지 (경고만)
  const conflicts =
    supplements && settings
      ? findConflicts(
          placeDoses(
            supplements.filter((s) => s.active).map((s) => ({ supplement: s, slots: s.schedule.map((i) => i.slot) })),
            settings
          ),
          settings
        )
      : []

  return (
    <div className="mx-auto max-w-3xl p-4 sm:p-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-bold">영양제 목록</h1>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={!supplements?.some((s) => s.active)}
            onClick={() => setRecommending(true)}
            className="rounded-lg border border-indigo-300 px-4 py-2 font-semibold text-indigo-700 hover:bg-indigo-50 disabled:opacity-40"
          >
            복용 시점 추천 받기
          </button>
          <button
            type="button"
            onClick={() => setEditing({ mode: 'create' })}
            className="rounded-lg bg-indigo-600 px-4 py-2 font-semibold text-white hover:bg-indigo-700"
          >
            + 영양제 추가
          </button>
        </div>
      </div>

      {conflicts.length > 0 && (
        <ul role="alert" className="mb-4 space-y-1 rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800">
          {conflicts.map((c) => (
            <li key={`${c.a.productId}-${c.b.productId}-${c.rule.a}-${c.rule.b}`}>
              ⚠ <b>{c.a.productName}</b>({c.a.time})과 <b>{c.b.productName}</b>({c.b.time})이 {c.gapMinutes}분 간격입니다.{' '}
              {c.rule.reason} <span className="text-xs text-red-600">(참고용 · 의사·약사 지시 우선)</span>
            </li>
          ))}
        </ul>
      )}

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
                    {s.source === 'public_data' && (
                      <span className="rounded bg-sky-100 px-2 py-0.5 text-xs text-sky-700">공공데이터</span>
                    )}
                    {!s.active && (
                      <span className="rounded bg-slate-200 px-2 py-0.5 text-xs text-slate-600">사용 중지</span>
                    )}
                  </div>
                  {s.ingredients.length > 0 && (
                    <p className="mt-1 text-sm text-slate-600">{s.ingredients.map(formatIngredient).join(' · ')}</p>
                  )}
                  <p className="mt-1 text-sm">
                    {s.schedule.length > 0 ? (
                      <span className="text-indigo-700">
                        {s.schedule
                          .map((item) => SLOT_LABELS[item.slot] + (item.customTime ? ` ${item.customTime}` : ''))
                          .join(' · ')}
                      </span>
                    ) : (
                      <span className="text-amber-700">복용 시점 미지정 — 수정에서 골라 주세요</span>
                    )}
                  </p>
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
