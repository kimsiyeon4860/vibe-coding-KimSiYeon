import { useEffect, useState, type FormEvent } from 'react'
import { parsePrescriptionDraft, prescriptionTimes, timingChanged } from '../../../shared/prescription'
import {
  SLOT_LABELS,
  SLOTS,
  type Prescription,
  type PrescriptionDraft,
  type ScheduleDraft,
  type Settings,
  type Slot
} from '../../../shared/types'

interface Props {
  /** 수정할 처방약. 없으면 새로 추가 */
  initial?: Prescription
  /** 새로 추가할 때 시작일 기본값 (오늘 복용일) */
  defaultStartDate: string
  onSaved: () => void
  onCancel: () => void
}

/** 처방약 먹는 때 표시 이름 (아침 식후 → 아침) */
const WHEN_LABELS: Record<Slot, string> = {
  wake: '기상 직후',
  breakfast: '아침',
  lunch: '점심',
  dinner: '저녁',
  bedtime: '취침 전'
}

const TIMING_WARNING =
  '처방전에 적힌 복용 시점과 다르게 바꾸려는 경우, 먼저 의사·약사와 확인하세요.\n이대로 저장할까요?'

function toDraft(p: Prescription | undefined, defaultStartDate: string): PrescriptionDraft {
  if (!p) {
    return {
      name: '',
      mealTiming: 'after',
      mealOffsetMinutes: '30',
      startDate: defaultStartDate,
      days: '',
      memo: '',
      schedule: []
    }
  }
  return {
    name: p.name,
    mealTiming: p.mealTiming,
    mealOffsetMinutes: String(p.mealOffsetMinutes),
    startDate: p.startDate,
    days: p.days === null ? '' : String(p.days),
    memo: p.memo,
    schedule: p.schedule.map((s) => ({ slot: s.slot, customTime: s.customTime ?? '', dose: s.dose }))
  }
}

// 처방약 추가·수정 입력 창
export default function PrescriptionForm({ initial, defaultStartDate, onSaved, onCancel }: Props) {
  const [draft, setDraft] = useState<PrescriptionDraft>(() => toDraft(initial, defaultStartDate))
  const [errors, setErrors] = useState<string[]>([])
  const [saving, setSaving] = useState(false)
  const [settings, setSettings] = useState<Settings | null>(null)

  useEffect(() => {
    void window.api.settings.get().then(setSettings)
  }, [])

  const update = (patch: Partial<PrescriptionDraft>) => setDraft((d) => ({ ...d, ...patch }))
  const scheduleOf = (slot: Slot) => draft.schedule.find((s) => s.slot === slot)

  const toggleSlot = (slot: Slot, checked: boolean) =>
    update({
      schedule: checked
        ? [...draft.schedule, { slot, customTime: '', dose: '' }]
        : draft.schedule.filter((s) => s.slot !== slot)
    })

  const setSchedule = (slot: Slot, field: 'customTime' | 'dose', value: string) =>
    update({
      schedule: draft.schedule.map((s): ScheduleDraft => (s.slot === slot ? { ...s, [field]: value } : s))
    })

  // 계산된 알람 시간 미리보기 (먹는 때를 고르기 전에도 모든 슬롯에 대해 보여준다)
  const preview = (() => {
    const offset = Number(draft.mealOffsetMinutes)
    if (!settings || (draft.mealTiming !== 'before' && draft.mealTiming !== 'after') || !Number.isInteger(offset)) {
      return null
    }
    const times = prescriptionTimes(
      {
        mealTiming: draft.mealTiming,
        mealOffsetMinutes: offset,
        schedule: SLOTS.map((slot) => ({ slot, customTime: null, dose: '' }))
      },
      settings
    )
    return Object.fromEntries(SLOTS.map((slot, i) => [slot, times[i]])) as Record<Slot, string>
  })()

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    const parsed = parsePrescriptionDraft(draft)
    if (!parsed.ok) {
      setErrors(parsed.errors)
      return
    }
    // 처방전 지시가 최우선: 저장된 처방약의 복용 시점을 바꾸면 한 번 더 확인
    if (initial && timingChanged(initial, parsed.value) && !window.confirm(TIMING_WARNING)) return

    setSaving(true)
    try {
      const result = initial
        ? await window.api.prescriptions.update(initial.id, draft)
        : await window.api.prescriptions.create(draft)
      if (result.ok) onSaved()
      else setErrors(result.errors)
    } catch {
      setErrors(['저장하지 못했습니다. 잠시 후 다시 시도해 주세요.'])
    } finally {
      setSaving(false)
    }
  }

  const inputClass =
    'rounded-lg border border-slate-300 px-3 py-2 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200'

  return (
    <div className="fixed inset-0 z-10 flex items-center justify-center bg-black/40 p-4">
      <form
        onSubmit={(e) => void submit(e)}
        className="flex max-h-full w-full max-w-xl flex-col rounded-xl bg-white shadow-xl"
      >
        <h2 className="border-b border-slate-200 px-6 py-4 text-lg font-bold">
          {initial ? '처방약 수정' : '처방약 추가'}
        </h2>

        <div className="space-y-4 overflow-y-auto px-6 py-4">
          <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
            약봉투·처방전에 적힌 대로 입력하세요. 처방전 지시가 앱보다 우선합니다.
          </p>

          <label className="block">
            <span className="text-sm font-medium">
              약 이름 <span className="text-red-500">*</span>
            </span>
            <input
              autoFocus
              value={draft.name}
              onChange={(e) => update({ name: e.target.value })}
              placeholder="예: 감기약, 혈압약"
              className={`${inputClass} w-full`}
            />
          </label>

          <div>
            <span className="text-sm font-medium">식사 기준</span>
            <div className="mt-1 flex flex-wrap items-center gap-3 text-sm">
              {(['before', 'after'] as const).map((timing) => (
                <label key={timing} className="flex items-center gap-1">
                  <input
                    type="radio"
                    name="mealTiming"
                    checked={draft.mealTiming === timing}
                    onChange={() => update({ mealTiming: timing })}
                  />
                  {timing === 'before' ? '식전' : '식후'}
                </label>
              ))}
              <input
                type="number"
                min={0}
                max={120}
                value={draft.mealOffsetMinutes}
                onChange={(e) => update({ mealOffsetMinutes: e.target.value })}
                aria-label="식전·식후 분"
                className={`${inputClass} w-20 py-1`}
              />
              분 <span className="text-xs text-slate-500">(식사 직후면 0)</span>
            </div>
          </div>

          <fieldset>
            <legend className="text-sm font-medium">먹는 때</legend>
            <p className="text-xs text-slate-500">
              하루 {draft.schedule.length}회 · 시간은 설정의 식사 시간으로 계산됩니다.
            </p>
            <div className="mt-2 space-y-1">
              {SLOTS.map((slot) => {
                const item = scheduleOf(slot)
                return (
                  <div
                    key={slot}
                    className={`flex flex-wrap items-center gap-2 rounded-lg px-3 py-2 ${item ? 'bg-indigo-50' : ''}`}
                  >
                    <label className="flex w-36 items-center gap-2">
                      <input type="checkbox" checked={!!item} onChange={(e) => toggleSlot(slot, e.target.checked)} />
                      <span className="text-sm">{WHEN_LABELS[slot]}</span>
                      <span
                        className={`font-mono text-xs ${item?.customTime ? 'text-slate-400 line-through' : 'text-slate-500'}`}
                      >
                        {preview?.[slot]}
                      </span>
                    </label>
                    {item && (
                      <>
                        <input
                          value={item.dose}
                          onChange={(e) => setSchedule(slot, 'dose', e.target.value)}
                          placeholder="1회 복용량 (예: 1포)"
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
                            className={`${inputClass} py-1 text-sm`}
                          />
                        </label>
                      </>
                    )}
                  </div>
                )
              })}
            </div>
          </fieldset>

          <div className="flex flex-wrap gap-4">
            <label className="block">
              <span className="text-sm font-medium">시작일</span>
              <input
                type="date"
                value={draft.startDate}
                onChange={(e) => update({ startDate: e.target.value })}
                className={`${inputClass} block`}
              />
            </label>
            <label className="block">
              <span className="text-sm font-medium">처방 일수</span>
              <span className="flex items-center gap-1">
                <input
                  type="number"
                  min={1}
                  max={365}
                  value={draft.days}
                  onChange={(e) => update({ days: e.target.value })}
                  placeholder="계속"
                  className={`${inputClass} w-24`}
                />
                일
              </span>
              <span className="text-xs text-slate-500">계속 먹는 약이면 비워 두세요</span>
            </label>
          </div>

          <label className="block">
            <span className="text-sm font-medium">메모</span>
            <textarea
              value={draft.memo}
              onChange={(e) => update({ memo: e.target.value })}
              placeholder="예: OO내과, 졸릴 수 있음"
              rows={2}
              className={`${inputClass} w-full`}
            />
          </label>

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
