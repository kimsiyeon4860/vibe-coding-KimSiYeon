import { useState } from 'react'
import { clockOf } from '../../../shared/schedule'
import { LIFE_EVENT_LABELS, MEAL_EVENTS, type DayEvents, type Hm, type LifeEvent, type MealEvent } from '../../../shared/types'

const MEAL_NAMES: Record<MealEvent, string> = { breakfast: '아침', lunch: '점심', dinner: '저녁' }
const isMeal = (event: LifeEvent): event is MealEvent => MEAL_EVENTS.includes(event as MealEvent)

const ICONS: Record<LifeEvent, string> = { wake: '☀️', breakfast: '🍚', lunch: '🍱', dinner: '🍲', bed: '🌙' }

interface Props {
  events: DayEvents
  /** 거른 식사 */
  skips: DayEvents
  /** '클릭 기록' 모드인 사건만 버튼으로 */
  clickEvents: LifeEvent[]
  onRecord: (event: LifeEvent, time?: Hm) => void
  onSkip: (meal: MealEvent) => void
  onClear: (event: LifeEvent) => void
}

// 오늘 복용 탭 위쪽 '생활 기록' 막대: 누르면 지금 시각으로 기록, 기록한 것은 시간 수정·지우기
export default function LifeEventBar({ events, skips, clickEvents, onRecord, onSkip, onClear }: Props) {
  const [editing, setEditing] = useState<LifeEvent | null>(null)
  const [editTime, setEditTime] = useState('')

  if (clickEvents.length === 0) return null

  return (
    <section aria-label="생활 기록" className="mb-4 rounded-xl border border-slate-200 bg-white p-3">
      <p className="mb-2 text-xs text-slate-500">
        생활 기록 — 누르면 지금 시각으로 기록되고, 그 시간에 맞춰 알람이 울립니다.
      </p>
      <div className="flex flex-wrap gap-2">
        {clickEvents.map((event) => {
          const at = events[event]
          if (editing === event) {
            return (
              <span key={event} className="flex items-center gap-1 rounded-lg border border-indigo-300 px-2 py-1 text-sm">
                {ICONS[event]}
                <input
                  type="time"
                  value={editTime}
                  onChange={(e) => setEditTime(e.target.value)}
                  aria-label={`${LIFE_EVENT_LABELS[event]} 시각`}
                  className="rounded border border-slate-300 px-1"
                />
                <button
                  type="button"
                  disabled={!editTime}
                  onClick={() => {
                    onRecord(event, editTime)
                    setEditing(null)
                  }}
                  className="rounded bg-indigo-600 px-2 text-white disabled:opacity-40"
                >
                  저장
                </button>
                <button type="button" onClick={() => setEditing(null)} className="px-1 text-slate-400">
                  취소
                </button>
              </span>
            )
          }
          if (at) {
            return (
              <span
                key={event}
                className="flex items-center gap-1 rounded-lg border border-green-200 bg-green-50 px-2 py-1 text-sm text-green-800"
              >
                {ICONS[event]} {LIFE_EVENT_LABELS[event]} <b className="font-mono">{clockOf(at)}</b>
                <button
                  type="button"
                  onClick={() => {
                    setEditTime(clockOf(at))
                    setEditing(event)
                  }}
                  aria-label={`${LIFE_EVENT_LABELS[event]} 시각 고치기`}
                  className="ml-1 text-xs text-green-700 hover:underline"
                >
                  고치기
                </button>
                <button
                  type="button"
                  onClick={() => onClear(event)}
                  aria-label={`${LIFE_EVENT_LABELS[event]} 기록 지우기`}
                  className="text-xs text-slate-400 hover:text-red-600"
                >
                  ✕
                </button>
              </span>
            )
          }
          if (skips[event] && isMeal(event)) {
            return (
              <span
                key={event}
                className="flex items-center gap-1 rounded-lg border border-slate-200 bg-slate-100 px-2 py-1 text-sm text-slate-500"
              >
                {ICONS[event]} {MEAL_NAMES[event]} 거름
                <button
                  type="button"
                  onClick={() => onClear(event)}
                  aria-label={`${MEAL_NAMES[event]} 거름 취소`}
                  className="ml-1 text-xs text-slate-400 hover:text-red-600"
                >
                  ✕
                </button>
              </span>
            )
          }
          return (
            <span key={event} className="flex items-stretch overflow-hidden rounded-lg border border-slate-300 text-sm">
              <button
                type="button"
                onClick={() => onRecord(event)}
                className="px-3 py-1 hover:bg-indigo-50"
              >
                {ICONS[event]} {LIFE_EVENT_LABELS[event]}
              </button>
              {isMeal(event) && (
                <button
                  type="button"
                  onClick={() => onSkip(event)}
                  aria-label={`오늘 ${MEAL_NAMES[event]} 안 먹어요`}
                  className="border-l border-slate-300 px-2 text-xs text-slate-500 hover:bg-slate-100"
                >
                  안 먹어요
                </button>
              )}
            </span>
          )
        })}
      </div>
    </section>
  )
}
