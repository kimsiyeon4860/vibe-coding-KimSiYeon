import { useState } from 'react'
import { clockOf } from '../../../shared/schedule'
import { LIFE_EVENT_LABELS, type DayEvents, type Hm, type LifeEvent } from '../../../shared/types'

const ICONS: Record<LifeEvent, string> = { wake: '☀️', breakfast: '🍚', lunch: '🍱', dinner: '🍲', bed: '🌙' }

interface Props {
  events: DayEvents
  /** '클릭 기록' 모드인 사건만 버튼으로 */
  clickEvents: LifeEvent[]
  onRecord: (event: LifeEvent, time?: Hm) => void
  onClear: (event: LifeEvent) => void
}

// 오늘 복용 탭 위쪽 '생활 기록' 막대: 누르면 지금 시각으로 기록, 기록한 것은 시간 수정·지우기
export default function LifeEventBar({ events, clickEvents, onRecord, onClear }: Props) {
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
          return (
            <button
              key={event}
              type="button"
              onClick={() => onRecord(event)}
              className="rounded-lg border border-slate-300 px-3 py-1 text-sm hover:border-indigo-400 hover:bg-indigo-50"
            >
              {ICONS[event]} {LIFE_EVENT_LABELS[event]}
            </button>
          )
        })}
      </div>
    </section>
  )
}
