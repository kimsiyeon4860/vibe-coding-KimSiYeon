import { format, parseISO } from 'date-fns'
import { ko } from 'date-fns/locale'
import { useEffect, useState } from 'react'
import type { DayStats, StatsView } from '../../../shared/stats'

const PERIODS = [7, 30, 'all'] as const
type Period = (typeof PERIODS)[number]
const periodLabel = (p: Period) => (p === 'all' ? '전체' : `최근 ${p}일`)

const percent = (rate: number | null) => (rate === null ? '–' : `${Math.round(rate * 100)}%`)

// 복용 기록(오늘 복용 화면 아래쪽): 복용률·날짜별 막대·연속 완료일·제품별 복용률
export default function HistoryPage() {
  const [period, setPeriod] = useState<Period>(7)
  const [stats, setStats] = useState<StatsView | null>(null)

  useEffect(() => {
    let alive = true
    const load = () => void window.api.stats.get(period).then((s) => alive && setStats(s))
    load()
    // 바로 위 오늘 목록에서 먹었어요·건너뛰기를 누르면 통계도 다시 계산한다
    const offChanged = window.api.today.onChanged(load)
    return () => {
      alive = false
      offChanged()
    }
  }, [period])

  return (
    <div className="mx-auto max-w-3xl p-4 sm:p-6">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-bold">복용 기록</h1>
        <div role="group" aria-label="기간" className="flex rounded-lg border border-slate-300 bg-white p-0.5 text-sm">
          {PERIODS.map((p) => (
            <button
              key={p}
              type="button"
              aria-pressed={period === p}
              onClick={() => setPeriod(p)}
              className={`rounded-md px-3 py-1 ${period === p ? 'bg-indigo-600 text-white' : 'text-slate-600 hover:bg-slate-100'}`}
            >
              {periodLabel(p)}
            </button>
          ))}
        </div>
      </div>

      {stats && (
        <>
          <div className="grid grid-cols-3 gap-3">
            <Card label={`${periodLabel(period)} 복용률`} value={percent(stats.rate)} accent />
            <Card label="먹음 · 건너뜀 · 놓침" value={`${stats.taken} · ${stats.skipped} · ${stats.missed}`} />
            <Card label="연속 완료" value={`${stats.streak}일`} />
          </div>

          <section className="mt-5 rounded-xl border border-slate-200 bg-white p-4">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="font-semibold">날짜별</h2>
              <Legend />
            </div>
            <DayBars days={stats.days} />
          </section>

          <section className="mt-5 rounded-xl border border-slate-200 bg-white p-4">
            <h2 className="mb-2 font-semibold">제품별 복용률</h2>
            {stats.products.length === 0 ? (
              <p className="text-sm text-slate-500">아직 기록이 없습니다.</p>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-slate-500">
                    <th className="py-1 font-normal">제품</th>
                    <th className="py-1 text-right font-normal">먹음</th>
                    <th className="py-1 text-right font-normal">건너뜀</th>
                    <th className="py-1 text-right font-normal">놓침</th>
                    <th className="w-40 py-1 text-right font-normal">복용률</th>
                  </tr>
                </thead>
                <tbody>
                  {stats.products.map((p) => (
                    <tr key={p.productId} className="border-t border-slate-100">
                      <td className="py-2">
                        {p.productName}
                        {p.kind === 'prescription' && (
                          <span className="ml-2 rounded bg-rose-100 px-1.5 py-0.5 text-xs font-medium text-rose-700">처방</span>
                        )}
                      </td>
                      <td className="py-2 text-right">{p.taken}</td>
                      <td className="py-2 text-right text-slate-500">{p.skipped}</td>
                      <td className={`py-2 text-right ${p.missed > 0 ? 'font-semibold text-red-600' : 'text-slate-500'}`}>
                        {p.missed}
                      </td>
                      <td className="py-2">
                        <div className="flex items-center justify-end gap-2">
                          <div className="h-2 w-20 overflow-hidden rounded bg-slate-100">
                            <div className="h-full bg-green-500" style={{ width: `${(p.rate ?? 0) * 100}%` }} />
                          </div>
                          <span className="w-10 text-right">{percent(p.rate)}</span>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>

          <p className="mt-4 text-xs text-slate-500">
            현재 복용 일정 기준으로 계산한 참고 통계입니다. 시간이 지났는데 기록이 없으면 &lsquo;놓침&rsquo;으로 셉니다. 일정에서
            뺀 시점이나 사용 중지한 영양제는 기록이 있는 것만 반영됩니다.
          </p>
        </>
      )}
    </div>
  )
}

function Card({ label, value, accent = false }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <p className="text-xs text-slate-500">{label}</p>
      <p className={`mt-1 text-2xl font-bold ${accent ? 'text-indigo-600' : ''}`}>{value}</p>
    </div>
  )
}

function Legend() {
  const item = (color: string, label: string) => (
    <span className="flex items-center gap-1">
      <span className={`inline-block h-2.5 w-2.5 rounded-sm ${color}`} />
      {label}
    </span>
  )
  return (
    <div className="flex gap-3 text-xs text-slate-500">
      {item('bg-green-500', '먹음')}
      {item('bg-slate-300', '건너뜀')}
      {item('bg-red-400', '놓침')}
      {item('border border-dashed border-slate-400', '예정')}
    </div>
  )
}

/** 날짜별 쌓은 막대 (차트 라이브러리 없이) */
function DayBars({ days }: { days: DayStats[] }) {
  const max = Math.max(1, ...days.map((d) => d.taken + d.skipped + d.missed + d.upcoming))
  const dense = days.length > 10
  // 날짜 글자는 6개 안팎만 (전체 기간은 막대가 수백 개일 수 있다)
  const labelStep = dense ? Math.max(5, Math.ceil(days.length / 6)) : 1
  const BAR_HEIGHT = 120

  return (
    <div className={`flex items-end ${days.length > 60 ? 'gap-px' : 'gap-1'}`} style={{ height: BAR_HEIGHT + 36 }}>
      {days.map((d, i) => {
        const date = parseISO(d.planDate)
        const segment = (n: number, className: string) =>
          n > 0 && <div className={className} style={{ height: (n / max) * BAR_HEIGHT }} />
        const title = `${format(date, 'M월 d일 (EEE)', { locale: ko })} — 먹음 ${d.taken}, 건너뜀 ${d.skipped}, 놓침 ${d.missed}${
          d.upcoming ? `, 예정 ${d.upcoming}` : ''
        }`
        return (
          <div key={d.planDate} title={title} className="flex min-w-0 flex-1 flex-col items-center justify-end">
            <div className="flex w-full max-w-8 flex-col-reverse overflow-hidden rounded-sm">
              {segment(d.taken, 'bg-green-500')}
              {segment(d.skipped, 'bg-slate-300')}
              {segment(d.missed, 'bg-red-400')}
              {segment(d.upcoming, 'border border-dashed border-slate-400')}
            </div>
            <span className="mt-1 h-8 whitespace-nowrap text-center text-[10px] leading-tight text-slate-500">
              {i % labelStep === 0 || i === days.length - 1 ? (
                <>
                  {format(date, 'M/d')}
                  {!dense && (
                    <>
                      <br />
                      {format(date, 'EEE', { locale: ko })}
                    </>
                  )}
                </>
              ) : null}
            </span>
          </div>
        )
      })}
    </div>
  )
}
