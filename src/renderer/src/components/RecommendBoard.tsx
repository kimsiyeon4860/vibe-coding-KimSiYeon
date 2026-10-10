import { useMemo, useState, type DragEvent } from 'react'
import { findConflicts, placeDoses, recommend, type Recommendation } from '../../../shared/recommend'
import { computeSlotTimes } from '../../../shared/schedule'
import { SLOT_LABELS, SLOTS, type ScheduleChange, type Settings, type Slot, type Supplement } from '../../../shared/types'

interface Props {
  supplements: Supplement[]
  settings: Settings
  onClose: () => void
  onApplied: () => void
}

/** 보드의 칸: 아직 시점이 없는 영양제를 두는 '미정' + 5개 시점 */
type Column = Slot | 'none'
const COLUMNS: Column[] = ['none', ...SLOTS]

const BASIS_BADGE: Record<Recommendation['basis'], { label: string; className: string }> = {
  label: { label: '라벨', className: 'bg-emerald-100 text-emerald-800' },
  rule: { label: '규칙', className: 'bg-indigo-100 text-indigo-800' },
  none: { label: '규칙 없음', className: 'bg-slate-200 text-slate-700' }
}

const sameSlots = (a: Slot[], b: Slot[]) => a.length === b.length && SLOTS.every((s) => a.includes(s) === b.includes(s))

// 복용 시점 추천 보드: 추천 결과를 시점별 칸에 놓고, 끌어다 놓아 옮긴 뒤 적용한다
export default function RecommendBoard({ supplements, settings, onClose, onApplied }: Props) {
  const active = useMemo(() => supplements.filter((s) => s.active), [supplements])
  const recommendations = useMemo(() => recommend(active, settings), [active, settings])
  const slotTimes = computeSlotTimes(settings)

  const [placement, setPlacement] = useState<Map<number, Slot[]>>(
    () => new Map(recommendations.map((r) => [r.productId, r.slots]))
  )
  const [dragOver, setDragOver] = useState<Column | null>(null)
  const [saving, setSaving] = useState(false)

  const slotsOf = (id: number) => placement.get(id) ?? []
  const recOf = (id: number) => recommendations.find((r) => r.productId === id)

  /** 영양제 하나를 from 칸에서 to 칸으로 */
  const move = (id: number, from: Column, to: Column) => {
    if (from === to) return
    setPlacement((prev) => {
      const slots = (prev.get(id) ?? []).filter((s) => s !== from)
      if (to !== 'none' && !slots.includes(to)) slots.push(to)
      return new Map(prev).set(
        id,
        SLOTS.filter((s) => slots.includes(s))
      )
    })
  }

  // 충돌 경고는 옮길 때마다 다시 계산 (막지는 않는다)
  const conflicts = findConflicts(
    placeDoses(
      active.map((s) => ({ supplement: s, slots: slotsOf(s.id) })),
      settings
    ),
    settings
  )
  const inConflict = (id: number, slot: Slot) =>
    conflicts.some((c) => (c.a.productId === id && c.a.slot === slot) || (c.b.productId === id && c.b.slot === slot))

  const changes: ScheduleChange[] = active
    .filter((s) =>
      !sameSlots(
        slotsOf(s.id),
        s.schedule.map((i) => i.slot)
      )
    )
    .map((s) => ({ id: s.id, slots: slotsOf(s.id) }))

  const apply = async () => {
    const message =
      `영양제 ${changes.length}개의 복용 시점을 바꿉니다.\n` +
      '그대로인 시점의 복용량·직접 지정 시간은 유지되고, 옮긴 시점은 직접 지정 시간이 비워집니다.\n' +
      '적용할까요?'
    if (!window.confirm(message)) return
    setSaving(true)
    try {
      await window.api.supplements.applySchedule(changes)
      onApplied()
    } finally {
      setSaving(false)
    }
  }

  const onDrop = (event: DragEvent, to: Column) => {
    event.preventDefault()
    setDragOver(null)
    try {
      const { id, from } = JSON.parse(event.dataTransfer.getData('text/plain')) as { id: number; from: Column }
      move(id, from, to)
    } catch {
      // 보드 밖에서 끌어온 것은 무시
    }
  }

  const cardsIn = (column: Column) =>
    active.filter((s) => (column === 'none' ? slotsOf(s.id).length === 0 : slotsOf(s.id).includes(column)))

  return (
    <div className="flex h-full flex-col p-4 sm:p-6">
      <div className="mb-3 flex items-center justify-between">
        <h1 className="text-xl font-bold">복용 시점 추천</h1>
        <div className="flex gap-2">
          <button type="button" onClick={onClose} className="rounded-lg px-4 py-2 hover:bg-slate-200">
            닫기
          </button>
          <button
            type="button"
            disabled={changes.length === 0 || saving}
            onClick={() => void apply()}
            className="rounded-lg bg-indigo-600 px-4 py-2 font-semibold text-white hover:bg-indigo-700 disabled:opacity-40"
          >
            이대로 적용{changes.length > 0 && ` (${changes.length})`}
          </button>
        </div>
      </div>

      <div role="note" className="mb-3 space-y-1 rounded-lg border border-amber-300 bg-amber-50 px-4 py-2 text-sm text-amber-900">
        <p>
          <b>참고용 정보이며 의사·약사의 지시가 우선합니다.</b>
        </p>
        <p className="text-xs">
          처방약은 처방전 지시를 따르며 추천에 포함하지 않습니다. 카드를 끌어다 다른 시점에 놓거나 &lsquo;옮기기&rsquo;로 바꿀 수
          있습니다. 근거 표시: <Badge basis="label" /> 제품 라벨 · <Badge basis="rule" /> 규칙 파일 · <Badge basis="none" /> 직접
          정하기
        </p>
      </div>

      {conflicts.length > 0 && (
        <ul role="alert" className="mb-3 space-y-1 rounded-lg border border-red-300 bg-red-50 px-4 py-2 text-sm text-red-800">
          {conflicts.map((c) => (
            <li key={`${c.a.productId}-${c.b.productId}-${c.rule.a}-${c.rule.b}`}>
              ⚠ <b>{c.a.productName}</b>({c.a.time})과 <b>{c.b.productName}</b>({c.b.time})이 {c.gapMinutes}분 간격입니다.{' '}
              {c.rule.reason}
            </li>
          ))}
        </ul>
      )}

      {active.length === 0 ? (
        <p className="text-slate-500">사용 중인 영양제가 없습니다.</p>
      ) : (
        <div className="grid min-h-0 flex-1 grid-cols-2 gap-2 overflow-y-auto sm:grid-cols-3 lg:grid-cols-6">
          {COLUMNS.map((column) => (
            <section
              key={column}
              aria-label={column === 'none' ? '미정' : SLOT_LABELS[column]}
              onDragOver={(e) => {
                e.preventDefault()
                setDragOver(column)
              }}
              onDragLeave={() => setDragOver((c) => (c === column ? null : c))}
              onDrop={(e) => onDrop(e, column)}
              className={`flex flex-col rounded-xl border-2 p-2 ${
                dragOver === column ? 'border-indigo-400 bg-indigo-50' : 'border-transparent bg-slate-100'
              }`}
            >
              <h2 className="mb-2 px-1 text-sm font-semibold">
                {column === 'none' ? '미정' : SLOT_LABELS[column]}
                {column !== 'none' && <span className="ml-1 font-mono text-xs text-slate-500">{slotTimes[column]}</span>}
              </h2>
              <ul className="space-y-2">
                {cardsIn(column).map((s) => {
                  const rec = recOf(s.id)
                  const current = s.schedule.map((i) => i.slot)
                  const changed = !sameSlots(slotsOf(s.id), current)
                  const warn = column !== 'none' && inConflict(s.id, column)
                  return (
                    <li
                      key={s.id}
                      draggable
                      onDragStart={(e) => e.dataTransfer.setData('text/plain', JSON.stringify({ id: s.id, from: column }))}
                      className={`cursor-grab rounded-lg border bg-white p-2 text-xs shadow-sm active:cursor-grabbing ${
                        warn ? 'border-red-400 ring-1 ring-red-300' : 'border-slate-200'
                      }`}
                    >
                      <div className="flex flex-wrap items-center gap-1">
                        <span className="text-sm font-semibold">{s.name}</span>
                        {rec && <Badge basis={rec.basis} />}
                        {rec?.evidenceLimited && <span className="text-[10px] text-amber-700">근거 약함</span>}
                      </div>
                      {rec?.reasons.map((reason) => (
                        <p key={reason} className="mt-1 text-slate-600">
                          {reason}
                        </p>
                      ))}
                      {rec?.unreadLabel && <p className="mt-1 text-amber-700">라벨 확인: {rec.unreadLabel}</p>}
                      {changed && (
                        <p className="mt-1 text-slate-400">
                          현재: {current.length > 0 ? current.map((slot) => SLOT_LABELS[slot]).join(', ') : '미정'}
                        </p>
                      )}
                      <select
                        aria-label={`${s.name} 옮기기`}
                        value=""
                        onChange={(e) => move(s.id, column, e.target.value as Column)}
                        className="mt-1 w-full rounded border border-slate-200 bg-slate-50 px-1 py-0.5"
                      >
                        <option value="" disabled>
                          옮기기…
                        </option>
                        {COLUMNS.filter((c) => c !== column).map((c) => (
                          <option key={c} value={c}>
                            {c === 'none' ? '빼기 (미정)' : SLOT_LABELS[c]}
                          </option>
                        ))}
                      </select>
                    </li>
                  )
                })}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  )
}

function Badge({ basis }: { basis: Recommendation['basis'] }) {
  const { label, className } = BASIS_BADGE[basis]
  return <span className={`rounded px-1 py-0.5 text-[10px] font-medium ${className}`}>{label}</span>
}
