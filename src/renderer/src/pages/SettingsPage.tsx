import { useEffect, useState, type FormEvent } from 'react'
import { computeSlotTimes, parseSettings } from '../../../shared/schedule'
import { SLOT_LABELS, SLOTS, type Settings, type Slot } from '../../../shared/types'

/** 입력 창 값 (숫자 칸도 입력 중에는 문자열) */
interface SettingsDraft {
  wakeTime: string
  breakfastTime: string
  lunchTime: string
  dinnerTime: string
  bedTime: string
  afterMealMinutes: string
  beforeBedMinutes: string
  slotOverrides: Record<Slot, string>
}

const TIME_FIELDS = [
  ['wakeTime', '기상'],
  ['breakfastTime', '아침 식사'],
  ['lunchTime', '점심 식사'],
  ['dinnerTime', '저녁 식사'],
  ['bedTime', '취침']
] as const

function toDraft(s: Settings): SettingsDraft {
  const slotOverrides = {} as Record<Slot, string>
  for (const slot of SLOTS) slotOverrides[slot] = s.slotOverrides[slot] ?? ''
  return {
    ...s,
    afterMealMinutes: String(s.afterMealMinutes),
    beforeBedMinutes: String(s.beforeBedMinutes),
    slotOverrides
  }
}

function fromDraft(d: SettingsDraft): Settings {
  const num = (v: string) => (v.trim() === '' ? NaN : Number(v))
  return { ...d, afterMealMinutes: num(d.afterMealMinutes), beforeBedMinutes: num(d.beforeBedMinutes) }
}

// 설정 탭: 생활 시간 → 슬롯 알람 시간, 알람 테스트
export default function SettingsPage() {
  const [draft, setDraft] = useState<SettingsDraft | null>(null)
  const [errors, setErrors] = useState<string[]>([])
  const [savedAt, setSavedAt] = useState<number | null>(null)

  useEffect(() => {
    void window.api.settings.get().then((s) => setDraft(toDraft(s)))
  }, [])

  if (!draft) return null

  const update = (patch: Partial<SettingsDraft>) => {
    setDraft({ ...draft, ...patch })
    setSavedAt(null)
  }
  const setOverride = (slot: Slot, value: string) => update({ slotOverrides: { ...draft.slotOverrides, [slot]: value } })

  // 입력하는 동안 슬롯 시간을 미리 보여준다
  const preview = parseSettings(fromDraft(draft))
  const computed = preview.ok ? computeSlotTimes({ ...preview.value, slotOverrides: {} }) : null

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    const result = await window.api.settings.save(fromDraft(draft))
    if (result.ok) {
      setDraft(toDraft(result.value))
      setErrors([])
      setSavedAt(Date.now())
    } else {
      setErrors(result.errors)
    }
  }

  const inputClass =
    'rounded-lg border border-slate-300 px-3 py-1.5 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200'

  return (
    <div className="mx-auto max-w-2xl space-y-4 p-6">
      <form onSubmit={(e) => void submit(e)} className="rounded-xl border border-slate-200 bg-white p-5">
        <h2 className="text-lg font-semibold">생활 시간</h2>
        <p className="mt-1 text-sm text-slate-500">입력한 시간으로 복용 시점별 알람 시간을 계산합니다.</p>

        <div className="mt-4 grid grid-cols-[8rem_1fr] items-center gap-x-4 gap-y-3">
          {TIME_FIELDS.map(([field, label]) => (
            <label key={field} className="contents">
              <span className="text-sm font-medium">{label}</span>
              <input
                type="time"
                value={draft[field]}
                onChange={(e) => update({ [field]: e.target.value })}
                className={`${inputClass} w-36`}
              />
            </label>
          ))}
          <label className="contents">
            <span className="text-sm font-medium">식후 알람</span>
            <span className="text-sm">
              식사 시작{' '}
              <input
                type="number"
                min={0}
                max={180}
                value={draft.afterMealMinutes}
                onChange={(e) => update({ afterMealMinutes: e.target.value })}
                className={`${inputClass} w-20`}
              />{' '}
              분 뒤
            </span>
          </label>
          <label className="contents">
            <span className="text-sm font-medium">취침 전 알람</span>
            <span className="text-sm">
              취침{' '}
              <input
                type="number"
                min={0}
                max={180}
                value={draft.beforeBedMinutes}
                onChange={(e) => update({ beforeBedMinutes: e.target.value })}
                className={`${inputClass} w-20`}
              />{' '}
              분 전
            </span>
          </label>
        </div>

        <h3 className="mt-6 font-semibold">복용 시점별 알람 시간</h3>
        <p className="mt-1 text-sm text-slate-500">계산된 시간 대신 쓰고 싶으면 직접 지정하세요.</p>
        <table className="mt-2 w-full text-sm">
          <tbody>
            {SLOTS.map((slot) => {
              const overridden = draft.slotOverrides[slot] !== ''
              return (
                <tr key={slot} className="border-t border-slate-100">
                  <td className="py-2 font-medium">{SLOT_LABELS[slot]}</td>
                  <td className={`py-2 font-mono ${overridden ? 'text-slate-400 line-through' : 'text-indigo-600'}`}>
                    {computed?.[slot] ?? '--:--'}
                  </td>
                  <td className="py-2">
                    <label className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={overridden}
                        onChange={(e) => setOverride(slot, e.target.checked ? (computed?.[slot] ?? '08:00') : '')}
                      />
                      직접 지정
                      {overridden && (
                        <input
                          type="time"
                          value={draft.slotOverrides[slot]}
                          onChange={(e) => setOverride(slot, e.target.value)}
                          aria-label={`${SLOT_LABELS[slot]} 직접 지정 시간`}
                          className={inputClass}
                        />
                      )}
                    </label>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>

        {errors.length > 0 && (
          <ul role="alert" className="mt-4 space-y-1 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
            {errors.map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        )}

        <div className="mt-4 flex items-center justify-end gap-3">
          {savedAt && <span className="text-sm text-green-700">저장했습니다</span>}
          <button
            type="submit"
            className="rounded-lg bg-indigo-600 px-5 py-2 font-semibold text-white hover:bg-indigo-700"
          >
            저장
          </button>
        </div>
      </form>

      <section className="rounded-xl border border-slate-200 bg-white p-5">
        <h2 className="text-lg font-semibold">알람 테스트</h2>
        <p className="mt-1 text-sm text-slate-500">
          알람 창·알림·소리가 잘 나오는지 확인합니다. 창을 닫아도 앱은 작업표시줄 오른쪽 트레이에서 계속
          실행됩니다.
        </p>
        <button
          type="button"
          onClick={() => window.api.testAlarm()}
          className="mt-4 rounded-lg bg-indigo-600 px-4 py-2 font-semibold text-white hover:bg-indigo-700"
        >
          테스트 알람 울리기
        </button>
      </section>
    </div>
  )
}
