import { useEffect, useState } from 'react'
import type { AlarmAction, AlarmItem } from '../../shared/types'
import { playChime } from './chime'

// 알람 팝업 창. 버튼을 누르기 전에는 닫히지 않는다.
export default function AlarmPopup() {
  const [items, setItems] = useState<AlarmItem[]>([])

  useEffect(() => {
    void window.api.getAlarmItems().then(setItems)
    // 팝업이 떠 있는 동안 새 알람이 오면 내용 교체
    return window.api.onAlarmItems(setItems)
  }, [])

  // 항목이 새로 들어올 때마다 알림음
  useEffect(() => {
    if (items.length > 0) playChime()
  }, [items])

  const respond = (action: AlarmAction) => window.api.respondAlarm(action)

  return (
    <div className="flex h-full flex-col border-4 border-indigo-500 bg-white text-slate-800">
      {/* 상단 띠를 잡고 창을 끌어 옮길 수 있다 */}
      <header className="bg-indigo-500 px-5 py-3 text-white [-webkit-app-region:drag]">
        <h1 className="text-xl font-bold">💊 복용 시간이에요</h1>
      </header>

      <ul className="flex-1 space-y-3 overflow-y-auto px-5 py-4">
        {items.map((item) => (
          <li key={item.id} className="rounded-lg bg-slate-50 px-4 py-3">
            <div className="flex items-baseline gap-3">
              <span className="font-mono text-sm text-indigo-600">{item.time}</span>
              <span className="text-lg font-semibold">{item.name}</span>
            </div>
            {item.note && <p className="mt-1 text-sm text-slate-500">{item.note}</p>}
          </li>
        ))}
      </ul>

      <footer className="grid grid-cols-3 gap-2 border-t border-slate-200 p-4">
        <button
          type="button"
          onClick={() => respond('taken')}
          className="col-span-3 rounded-lg bg-green-600 py-3 text-lg font-bold text-white hover:bg-green-700"
        >
          먹었어요
        </button>
        <button
          type="button"
          onClick={() => respond('snoozed')}
          className="col-span-2 rounded-lg bg-slate-200 py-2 font-semibold hover:bg-slate-300"
        >
          10분 뒤 다시
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
