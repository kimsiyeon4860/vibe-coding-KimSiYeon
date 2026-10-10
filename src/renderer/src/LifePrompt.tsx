import { useEffect, useState } from 'react'
import type { MealEvent, PromptAnswer, PromptInfo } from '../../shared/types'
import { playChime } from './chime'

const MEAL_NAMES: Record<MealEvent, string> = { breakfast: '아침', lunch: '점심', dinner: '저녁' }

// 생활 기록 확인 창: 기상(그날 처음 PC를 쓸 때) / 식사("○○ 드셨어요?", 기록이 없을 때)
export default function LifePrompt() {
  const [info, setInfo] = useState<PromptInfo | null>(null)
  const [time, setTime] = useState('')

  useEffect(() => {
    void window.api.prompt.info().then((i) => {
      if (!i) return
      setInfo(i)
      setTime(i.now)
      if (i.sound) playChime()
    })
  }, [])

  if (!info) return null
  const respond = (answer: PromptAnswer) => window.api.prompt.respond(answer)
  const isMeal = info.kind === 'meal'
  const meal = isMeal ? MEAL_NAMES[info.event as MealEvent] : ''

  return (
    <div
      className={`flex h-full flex-col border-4 bg-white text-slate-800 ${isMeal ? 'border-indigo-400' : 'border-amber-400'}`}
    >
      <header className={`px-5 py-3 [-webkit-app-region:drag] ${isMeal ? 'bg-indigo-400 text-white' : 'bg-amber-400'}`}>
        <h1 className="text-lg font-bold">{isMeal ? `🍚 ${meal} 드셨어요?` : '☀️ 오늘 일어난 시간을 기록할까요?'}</h1>
      </header>
      <div className="flex flex-1 flex-col gap-3 px-5 py-4">
        <p className="text-sm text-slate-600">
          {isMeal
            ? `${meal} 식사에 맞춰 먹는 약이 있어요. 드셨으면 기록해 주세요. 식후 알람이 그때에 맞춰 울립니다.`
            : '일어난 시간을 기록하면 ‘기상 직후’ 알람이 그때에 맞춰 울립니다.'}
        </p>
        <button
          type="button"
          onClick={() => respond({ action: 'now' })}
          className={`rounded-lg py-2.5 font-bold text-white ${isMeal ? 'bg-indigo-600 hover:bg-indigo-700' : 'bg-amber-500 hover:bg-amber-600'}`}
        >
          {isMeal ? '지금 먹어요 / 방금 먹었어요' : '방금 일어났어요'} ({info.now})
        </button>
        <div className="flex items-center gap-2">
          <input
            type="time"
            value={time}
            onChange={(e) => setTime(e.target.value)}
            aria-label={isMeal ? '먹은 시각' : '일어난 시각'}
            className="flex-1 rounded-lg border border-slate-300 px-3 py-1.5"
          />
          <button
            type="button"
            disabled={!time}
            onClick={() => respond({ action: 'at', time })}
            className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-semibold hover:bg-slate-50 disabled:opacity-40"
          >
            {isMeal ? '이 시간에 먹었어요' : '이 시간에 일어났어요'}
          </button>
        </div>
        {isMeal && (
          <button
            type="button"
            onClick={() => respond({ action: 'skip' })}
            className="rounded-lg border border-slate-300 py-2 text-sm hover:bg-slate-50"
          >
            오늘 {meal}은 안 먹어요
          </button>
        )}
        <button
          type="button"
          onClick={() => respond({ action: 'later' })}
          className="mt-auto text-sm text-slate-400 hover:text-slate-600"
        >
          {isMeal ? '나중에 (30분 뒤 다시 물어볼게요)' : '나중에 (오늘 복용 탭이나 트레이에서 기록할 수 있어요)'}
        </button>
      </div>
    </div>
  )
}
