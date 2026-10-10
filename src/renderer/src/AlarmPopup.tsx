import { useEffect, useState } from 'react'
import { overdueLabel } from '../../shared/alarm'
import type { AlarmAction, AlarmState } from '../../shared/types'
import { playChime } from './chime'

// 알람 팝업 창. 버튼을 누르기 전에는 닫히지 않는다. 버튼은 팝업의 모든 항목에 적용된다.
export default function AlarmPopup() {
  const [state, setState] = useState<AlarmState>({ items: [], snoozeMinutes: 10 })
  const [now, setNow] = useState(() => new Date())

  useEffect(() => {
    // 구독을 먼저 해 두고 준비 완료를 알린다 (그 사이 이벤트를 놓치지 않도록)
    const offState = window.api.alarm.onState(setState)
    const offRing = window.api.alarm.onRing(playChime)
    void window.api.alarm.ready().then(({ ringNow, ...initial }) => {
      setState(initial)
      if (ringNow) playChime()
    })
    // "N분 지남" 문구 갱신
    const timer = setInterval(() => setNow(new Date()), 30_000)
    return () => {
      offState()
      offRing()
      clearInterval(timer)
    }
  }, [])

  const respond = (action: AlarmAction) => window.api.alarm.respond(action)

  return (
    <div className="flex h-full flex-col border-4 border-indigo-500 bg-white text-slate-800">
      {/* 상단 띠를 잡고 창을 끌어 옮길 수 있다 */}
      <header className="bg-indigo-500 px-5 py-3 text-white [-webkit-app-region:drag]">
        <h1 className="text-xl font-bold">💊 복용 시간이에요</h1>
      </header>

      <ul className="flex-1 space-y-2 overflow-y-auto px-5 py-4">
        {state.items.map((item) => {
          const overdue = item.test ? '' : overdueLabel(item.scheduledAt, now)
          return (
            <li key={item.key} className="rounded-lg bg-slate-50 px-4 py-3">
              <div className="flex items-baseline gap-3">
                <span className="font-mono text-sm text-indigo-600">{item.time}</span>
                <span className="text-lg font-semibold">{item.productName}</span>
                {overdue && <span className="ml-auto text-xs font-medium text-amber-700">{overdue}</span>}
              </div>
              {item.dose && <p className="mt-1 text-sm text-slate-500">{item.dose}</p>}
            </li>
          )
        })}
      </ul>

      <footer className="grid grid-cols-3 gap-2 border-t border-slate-200 p-4">
        <button
          type="button"
          onClick={() => respond('taken')}
          className="col-span-3 rounded-lg bg-green-600 py-3 text-lg font-bold text-white hover:bg-green-700"
        >
          {state.items.length > 1 ? `모두 먹었어요 (${state.items.length})` : '먹었어요'}
        </button>
        <button
          type="button"
          onClick={() => respond('snoozed')}
          className="col-span-2 rounded-lg bg-slate-200 py-2 font-semibold hover:bg-slate-300"
        >
          {state.snoozeMinutes}분 뒤 다시
        </button>
        <button
          type="button"
          onClick={() => respond('skipped')}
          className="rounded-lg py-2 text-slate-500 hover:bg-slate-100"
        >
          건너뛰기
        </button>
      </footer>
    </div>
  )
}
