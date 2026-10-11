import { useEffect, useState, type FormEvent } from 'react'
import { computeSlotTimes, parseSettings } from '../../../shared/schedule'
import WebSettings from '../components/WebSettings'
import {
  LIFE_EVENTS,
  SLOT_LABELS,
  SLOTS,
  type EnvInfo,
  type EventMode,
  type LifeEvent,
  type MealEvent,
  type Settings,
  type Slot
} from '../../../shared/types'

/** 설정 화면의 생활 사건 이름 */
const EVENT_NAMES: Record<LifeEvent, string> = {
  wake: '기상',
  breakfast: '아침 식사',
  lunch: '점심 식사',
  dinner: '저녁 식사',
  bed: '취침'
}

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
  alarmSound: boolean
  snoozeMinutes: string
  repeatIntervalMinutes: string
  repeatMaxCount: string
  autoLaunch: boolean
  eventModes: Record<LifeEvent, EventMode>
  eventFallbackMinutes: string
  usualMeals: Record<MealEvent, boolean>
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
    slotOverrides,
    snoozeMinutes: String(s.snoozeMinutes),
    repeatIntervalMinutes: String(s.repeatIntervalMinutes),
    repeatMaxCount: String(s.repeatMaxCount),
    eventFallbackMinutes: String(s.eventFallbackMinutes)
  }
}

function fromDraft(d: SettingsDraft): Settings {
  const num = (v: string) => (v.trim() === '' ? NaN : Number(v))
  return {
    ...d,
    afterMealMinutes: num(d.afterMealMinutes),
    beforeBedMinutes: num(d.beforeBedMinutes),
    snoozeMinutes: num(d.snoozeMinutes),
    repeatIntervalMinutes: num(d.repeatIntervalMinutes),
    repeatMaxCount: num(d.repeatMaxCount),
    eventFallbackMinutes: num(d.eventFallbackMinutes)
  }
}

// 설정 화면: 생활 시간 → 슬롯 알람 시간, 알람 테스트
export default function SettingsPage() {
  const [draft, setDraft] = useState<SettingsDraft | null>(null)
  const [errors, setErrors] = useState<string[]>([])
  const [savedAt, setSavedAt] = useState<number | null>(null)

  const [envInfo, setEnvInfo] = useState<EnvInfo | null>(null)
  const isWeb = window.api.platform === 'web'

  useEffect(() => {
    void window.api.app.envInfo().then(setEnvInfo)
  }, [])

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
    <div className="mx-auto max-w-2xl space-y-4 p-4 sm:p-6">
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

        <h3 className="mt-6 font-semibold">평소 먹는 식사</h3>
        <div className="mt-2 flex gap-4 text-sm">
          {(['breakfast', 'lunch', 'dinner'] as const).map((meal) => (
            <label key={meal} className="flex items-center gap-1">
              <input
                type="checkbox"
                checked={draft.usualMeals[meal]}
                onChange={(e) => update({ usualMeals: { ...draft.usualMeals, [meal]: e.target.checked } })}
              />
              {EVENT_NAMES[meal].replace(' 식사', '')}
            </label>
          ))}
        </div>
        <p className="mt-1 text-xs text-slate-500">
          평소 안 먹는 식사에 놓인 영양제는, 그날 그 식사를 기록하지 않으면 다음 식사 알람으로 옮겨 알려 드려요. 복용 시점 추천도
          그 식사를 피합니다. 처방약은 처방대로 두고 바꾸지 않습니다.
        </p>

        <h3 className="mt-6 font-semibold">생활 기록 방식</h3>
        <p className="mt-1 text-sm text-slate-500">
          <b>클릭 기록</b>: &lsquo;오늘 복용&rsquo; 탭{isWeb ? '' : '이나 트레이'}에서 &lsquo;일어났어요&rsquo;·&lsquo;점심 먹어요&rsquo;를 누른 때를 기준으로
          알람이 울립니다 (식후 알람은 누른 뒤 식후 간격만큼). 생활이 불규칙하면 이쪽이 맞습니다. <b>고정 시간</b>: 위에 입력한
          시간에 울립니다.
        </p>
        <table className="mt-2 w-full text-sm">
          <tbody>
            {LIFE_EVENTS.map((event) => (
              <tr key={event} className="border-t border-slate-100">
                <td className="w-28 py-2 font-medium">{EVENT_NAMES[event]}</td>
                {(['click', 'fixed'] as const).map((mode) => (
                  <td key={mode} className="py-2">
                    <label className="flex items-center gap-1">
                      <input
                        type="radio"
                        name={`mode-${event}`}
                        checked={draft.eventModes[event] === mode}
                        onChange={() => update({ eventModes: { ...draft.eventModes, [event]: mode } })}
                      />
                      {mode === 'click' ? '클릭 기록' : '고정 시간'}
                    </label>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        <label className="mt-2 block text-sm">
          클릭 기록인데 기록이 없으면 평소 시간{' '}
          <input
            type="number"
            min={15}
            max={240}
            value={draft.eventFallbackMinutes}
            onChange={(e) => update({ eventFallbackMinutes: e.target.value })}
            className={`${inputClass} w-20`}
          />{' '}
          분 뒤에 그냥 알림
        </label>
        <p className="mt-1 text-xs text-slate-500">
          처방약의 &lsquo;식전 N분&rsquo;은 식사 시작을 미리 알 수 없어 항상 위의 고정 시간으로 알립니다. 영양제마다 직접 지정한
          시간도 그대로 따릅니다.
        </p>

        <h3 className="mt-6 font-semibold">알람</h3>
        <div className="mt-2 grid grid-cols-[8rem_1fr] items-center gap-x-4 gap-y-3 text-sm">
          <span className="font-medium">알람 소리</span>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={draft.alarmSound}
              onChange={(e) => update({ alarmSound: e.target.checked })}
            />
            알람이 울릴 때 소리 내기
          </label>
          <label className="contents">
            <span className="font-medium">다시 알림 버튼</span>
            <span>
              <input
                type="number"
                min={1}
                max={60}
                value={draft.snoozeMinutes}
                onChange={(e) => update({ snoozeMinutes: e.target.value })}
                className={`${inputClass} w-20`}
              />{' '}
              분 뒤 다시
            </span>
          </label>
          <label className="contents">
            <span className="font-medium">응답이 없으면</span>
            <span>
              <input
                type="number"
                min={1}
                max={30}
                value={draft.repeatIntervalMinutes}
                onChange={(e) => update({ repeatIntervalMinutes: e.target.value })}
                aria-label="재알림 간격(분)"
                className={`${inputClass} w-20`}
              />{' '}
              분마다, 최대{' '}
              <input
                type="number"
                min={0}
                max={20}
                value={draft.repeatMaxCount}
                onChange={(e) => update({ repeatMaxCount: e.target.value })}
                aria-label="재알림 최대 횟수"
                className={`${inputClass} w-20`}
              />{' '}
              번 다시 알림
            </span>
          </label>
        </div>
        <p className="mt-2 text-xs text-slate-500">
          최대 횟수를 넘으면 소리는 멈추지만 알람 창은 응답할 때까지 화면에 남아 있습니다.
        </p>

        {!isWeb && (
          <>
            <h3 className="mt-6 font-semibold">앱</h3>
            <label className="mt-2 flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={draft.autoLaunch}
                onChange={(e) => update({ autoLaunch: e.target.checked })}
              />
              Windows 시작 시 자동 실행 (작업표시줄 트레이에만 뜹니다)
            </label>
            {envInfo && !envInfo.isPackaged && (
              <p className="mt-1 text-xs text-slate-500">개발 모드에서는 적용되지 않고, 설치한 앱에서만 적용됩니다.</p>
            )}
          </>
        )}

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

      {window.api.web && <WebSettings web={window.api.web} />}

      {envInfo && !isWeb && (
        <section className="rounded-xl border border-slate-200 bg-white p-5">
          <h2 className="text-lg font-semibold">제품 검색 API 키</h2>
          <p className="mt-1 text-sm">
            건강기능식품 (식품안전나라 <code>FOODSAFETY_API_KEY</code>):{' '}
            {!envInfo.hasSearchKey ? (
              <b className="text-red-700">없음</b>
            ) : envInfo.isSampleKey ? (
              <b className="text-amber-700">견본 키 사용 중 (검색 결과 최대 5건)</b>
            ) : (
              <b className="text-green-700">설정됨</b>
            )}
          </p>
          <p className="mt-1 text-sm">
            일반의약품 (공공데이터포털 <code>DATA_GO_KR_API_KEY</code>):{' '}
            {envInfo.hasDrugKey ? <b className="text-green-700">설정됨</b> : <b className="text-red-700">없음</b>}
          </p>
          <p className="mt-1 text-xs text-slate-500">키가 없는 쪽은 검색되지 않고, 직접 입력은 언제나 됩니다.</p>
          <p className="mt-1 break-all text-xs text-slate-500">
            키 파일: {envInfo.envPath}
            <br />이 파일에 <code>이름=발급받은키</code> 형태로 한 줄씩 넣고 앱을 다시 켜세요. 파일은 메모장이나 VS Code로
            여세요.
          </p>
          <button
            type="button"
            onClick={() => void window.api.app.openEnvFolder()}
            className="mt-3 rounded-lg border border-slate-300 px-4 py-2 text-sm hover:bg-slate-50"
          >
            키 파일 폴더 열기
          </button>
        </section>
      )}

      <section className="rounded-xl border border-slate-200 bg-white p-5">
        <h2 className="text-lg font-semibold">알람 테스트</h2>
        <p className="mt-1 text-sm text-slate-500">
          알람 창·알림·소리가 잘 나오는지 확인합니다.{' '}
          {isWeb
            ? '웹판은 이 탭이 열려 있어야 알람이 울립니다.'
            : '창을 닫아도 앱은 작업표시줄 오른쪽 트레이에서 계속 실행됩니다.'}
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
