import { format, parseISO } from 'date-fns'
import { ko } from 'date-fns/locale'
import { useCallback, useEffect, useState } from 'react'
import { clockOf } from '../../../shared/schedule'
import {
  LIFE_EVENT_LABELS,
  SLOT_LABELS,
  type CheckAction,
  type DayPlanEntry,
  type Hm,
  type LifeEvent,
  type TodayView
} from '../../../shared/types'
import LifeEventBar from '../components/LifeEventBar'
import PharmacistNotice from '../components/PharmacistNotice'

/** 같은 시각·슬롯끼리 묶은 한 덩어리 */
interface Group {
  key: string
  time: string
  label: string
  entries: DayPlanEntry[]
}

function groupEntries(entries: DayPlanEntry[]): Group[] {
  const groups: Group[] = []
  for (const e of entries) {
    const key = `${e.scheduledAt}|${e.slot}`
    const last = groups.at(-1)
    if (last?.key === key) last.entries.push(e)
    else
      groups.push({
        key,
        time: e.waitingFor ? '기록 대기' : e.time,
        label: SLOT_LABELS[e.slot],
        entries: [e]
      })
  }
  return groups
}

// 오늘 복용 탭: 오늘 먹을 영양제를 시간순으로 보여주고 직접 체크한다
export default function TodayPage() {
  const [view, setView] = useState<TodayView | null>(null)
  const [now, setNow] = useState(() => Date.now())

  const reload = useCallback(async () => {
    setView(await window.api.today.get())
    setNow(Date.now())
  }, [])

  useEffect(() => {
    void reload()
    // 1분마다, 그리고 창이 다시 보일 때 새로고침 (날짜가 바뀌거나 시간이 지난 항목 표시)
    const timer = setInterval(() => void reload(), 60_000)
    const onFocus = () => void reload()
    window.addEventListener('focus', onFocus)
    // 알람 팝업에서 응답하면 바로 반영
    const offChanged = window.api.today.onChanged(() => void reload())
    return () => {
      clearInterval(timer)
      window.removeEventListener('focus', onFocus)
      offChanged()
    }
  }, [reload])

  if (!view) return null

  const check = async (e: DayPlanEntry, action: CheckAction) => {
    setView(await window.api.today.check(view.planDate, e.productId, e.slot, action))
  }
  const undo = async (e: DayPlanEntry) => {
    setView(await window.api.today.undo(view.planDate, e.productId, e.slot))
  }
  const recordEvent = async (event: LifeEvent, time?: Hm) => {
    setView(await window.api.today.recordEvent(view.planDate, event, time))
  }
  const clearEvent = async (event: LifeEvent) => {
    setView(await window.api.today.clearEvent(view.planDate, event))
  }

  const done = view.entries.filter((e) => e.status !== 'pending').length
  const title = format(parseISO(view.planDate), 'M월 d일 (EEE)', { locale: ko })

  return (
    <div className="mx-auto max-w-3xl p-6">
      <div className="mb-4 flex items-baseline justify-between">
        <h1 className="text-xl font-bold">{title} 복용</h1>
        {view.entries.length > 0 && (
          <span className="text-sm text-slate-500">
            {done} / {view.entries.length} 완료
          </span>
        )}
      </div>

      <LifeEventBar
        events={view.events}
        clickEvents={view.clickEvents}
        onRecord={(event, time) => void recordEvent(event, time)}
        onClear={(event) => void clearEvent(event)}
      />

      {view.mixesPrescriptionAndSupplement && <PharmacistNotice />}

      {view.entries.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white p-10 text-center text-slate-500">
          오늘 먹을 약이 없습니다.
          <br />
          <b>영양제</b>·<b>처방약</b> 탭에서 추가하고 먹는 때를 골라 주세요.
        </div>
      ) : (
        <ol className="space-y-4">
          {groupEntries(view.entries).map((g) => (
            <li key={g.key}>
              <h2 className="mb-2 flex items-baseline gap-2">
                <span className="font-mono text-lg font-semibold text-indigo-600">{g.time}</span>
                <span className="text-sm text-slate-500">{g.label}</span>
              </h2>
              <ul className="space-y-2">
                {g.entries.map((e) => (
                  <EntryRow
                    key={`${e.productId}-${e.slot}`}
                    entry={e}
                    overdue={e.status === 'pending' && Date.parse(e.scheduledAt) < now}
                    snoozed={e.status === 'pending' && e.snoozedUntil !== null && Date.parse(e.snoozedUntil) > now}
                    onCheck={(action) => void check(e, action)}
                    onUndo={() => void undo(e)}
                  />
                ))}
              </ul>
            </li>
          ))}
        </ol>
      )}
    </div>
  )
}

interface EntryRowProps {
  entry: DayPlanEntry
  overdue: boolean
  /** 알람에서 'N분 뒤 다시'를 눌러 기다리는 중 */
  snoozed: boolean
  onCheck: (action: CheckAction) => void
  onUndo: () => void
}

function EntryRow({ entry, overdue, snoozed, onCheck, onUndo }: EntryRowProps) {
  const bg =
    entry.status === 'taken'
      ? 'border-green-200 bg-green-50'
      : entry.status === 'skipped'
        ? 'border-slate-200 bg-slate-100'
        : overdue
          ? 'border-amber-300 bg-amber-50'
          : 'border-slate-200 bg-white'

  return (
    <li className={`flex items-center justify-between gap-4 rounded-xl border px-4 py-3 ${bg}`}>
      <div className="min-w-0">
        <span className={`font-semibold ${entry.status === 'skipped' ? 'text-slate-400 line-through' : ''}`}>
          {entry.productName}
        </span>
        {entry.kind === 'prescription' && <PrescriptionBadge />}
        {entry.dose && <span className="ml-2 text-sm text-slate-500">{entry.dose}</span>}
        {entry.status === 'pending' && entry.waitingFor && !overdue && (
          <span className="ml-2 text-xs text-slate-500">
            &lsquo;{LIFE_EVENT_LABELS[entry.waitingFor]}&rsquo; 기록하면 알림 · 기록이 없으면 {clockOf(entry.scheduledAt)}에 알림
          </span>
        )}
        {snoozed && entry.snoozedUntil ? (
          <span className="ml-2 text-xs font-medium text-indigo-600">{clockOf(entry.snoozedUntil)}에 다시 알림</span>
        ) : (
          overdue && <span className="ml-2 text-xs font-medium text-amber-700">시간 지남</span>
        )}
      </div>

      {entry.status === 'pending' ? (
        <div className="flex shrink-0 gap-2">
          <button
            type="button"
            onClick={() => onCheck('taken')}
            className="rounded-lg bg-green-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-green-700"
          >
            먹었어요
          </button>
          <button
            type="button"
            onClick={() => onCheck('skipped')}
            className="rounded-lg px-3 py-1.5 text-sm text-slate-500 hover:bg-slate-100"
          >
            건너뛰기
          </button>
        </div>
      ) : (
        <div className="flex shrink-0 items-center gap-3 text-sm">
          <span className={entry.status === 'taken' ? 'font-medium text-green-700' : 'text-slate-500'}>
            {entry.status === 'taken' ? '✓ 먹음' : '건너뜀'}
            {entry.actedAt && ` ${clockOf(entry.actedAt)}`}
          </span>
          <button type="button" onClick={onUndo} className="text-slate-400 hover:text-slate-700 hover:underline">
            되돌리기
          </button>
        </div>
      )}
    </li>
  )
}

function PrescriptionBadge() {
  return <span className="ml-2 rounded bg-rose-100 px-1.5 py-0.5 text-xs font-medium text-rose-700">처방</span>
}
