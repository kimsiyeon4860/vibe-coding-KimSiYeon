import { useEffect, useState } from 'react'

// 그날 처음 PC를 쓸 때 뜨는 기상 기록 창
export default function WakePrompt() {
  const [now, setNow] = useState('')
  const [time, setTime] = useState('')

  useEffect(() => {
    void window.api.wake.info().then((info) => {
      setNow(info.now)
      setTime(info.now)
    })
  }, [])

  return (
    <div className="flex h-full flex-col border-4 border-amber-400 bg-white text-slate-800">
      <header className="bg-amber-400 px-5 py-3 [-webkit-app-region:drag]">
        <h1 className="text-lg font-bold">☀️ 오늘 일어난 시간을 기록할까요?</h1>
      </header>
      <div className="flex flex-1 flex-col gap-3 px-5 py-4">
        <p className="text-sm text-slate-600">
          일어난 시간을 기록하면 &lsquo;기상 직후&rsquo; 알람이 그때에 맞춰 울립니다.
        </p>
        <button
          type="button"
          onClick={() => window.api.wake.respond({ action: 'now' })}
          className="rounded-lg bg-amber-500 py-2.5 font-bold text-white hover:bg-amber-600"
        >
          방금 일어났어요{now && ` (${now})`}
        </button>
        <div className="flex items-center gap-2">
          <input
            type="time"
            value={time}
            onChange={(e) => setTime(e.target.value)}
            aria-label="일어난 시각"
            className="flex-1 rounded-lg border border-slate-300 px-3 py-1.5"
          />
          <button
            type="button"
            disabled={!time}
            onClick={() => window.api.wake.respond({ action: 'at', time })}
            className="rounded-lg border border-amber-400 px-3 py-1.5 text-sm font-semibold text-amber-700 hover:bg-amber-50 disabled:opacity-40"
          >
            이 시간에 일어났어요
          </button>
        </div>
        <button
          type="button"
          onClick={() => window.api.wake.respond({ action: 'later' })}
          className="mt-auto text-sm text-slate-400 hover:text-slate-600"
        >
          나중에 (오늘 복용 탭이나 트레이에서 기록할 수 있어요)
        </button>
      </div>
    </div>
  )
}
