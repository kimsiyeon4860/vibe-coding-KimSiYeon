import { format, parseISO } from 'date-fns'
import { ko } from 'date-fns/locale'
import { useCallback, useEffect, useState } from 'react'
import {
  describeTiming,
  prescriptionDayNumber,
  prescriptionEndDate,
  prescriptionStatus,
  prescriptionTimes
} from '../../../shared/prescription'
import type { Prescription, Settings } from '../../../shared/types'
import PharmacistNotice from '../components/PharmacistNotice'
import PrescriptionForm from '../components/PrescriptionForm'

type Editing = null | { mode: 'create' } | { mode: 'edit'; prescription: Prescription }

interface PageData {
  prescriptions: Prescription[]
  planDate: string
  settings: Settings
  hasActiveSupplement: boolean
}

const shortDate = (date: string) => format(parseISO(date), 'M월 d일', { locale: ko })

// 처방약 탭: 복용 중 / 복용 완료 목록
export default function PrescriptionsPage() {
  const [data, setData] = useState<PageData | null>(null)
  const [editing, setEditing] = useState<Editing>(null)

  const reload = useCallback(async () => {
    const [prescriptions, today, settings, supplements] = await Promise.all([
      window.api.prescriptions.list(),
      window.api.today.get(),
      window.api.settings.get(),
      window.api.supplements.list()
    ])
    setData({
      prescriptions,
      planDate: today.planDate,
      settings,
      hasActiveSupplement: supplements.some((s) => s.active && s.schedule.length > 0)
    })
  }, [])

  useEffect(() => {
    void reload()
  }, [reload])

  if (!data) return null

  const current = data.prescriptions.filter((p) => prescriptionStatus(p, data.planDate) !== 'finished')
  const finished = data.prescriptions.filter((p) => prescriptionStatus(p, data.planDate) === 'finished')

  const setActive = async (p: Prescription, active: boolean) => {
    await window.api.prescriptions.setActive(p.id, active)
    await reload()
  }

  const remove = async (p: Prescription) => {
    const message =
      `'${p.name}'을(를) 삭제할까요?\n` +
      '복용 기록도 함께 지워지며 되돌릴 수 없습니다.\n' +
      "기록을 남기려면 '복용 종료'를 쓰세요."
    if (!window.confirm(message)) return
    await window.api.prescriptions.remove(p.id)
    await reload()
  }

  const onSaved = async () => {
    setEditing(null)
    await reload()
  }

  const card = (p: Prescription) => {
    const status = prescriptionStatus(p, data.planDate)
    const end = prescriptionEndDate(p)
    let period: string
    if (status === 'upcoming') period = `${shortDate(p.startDate)} 시작 예정`
    else if (end === null) period = `${shortDate(p.startDate)}부터 계속 복용`
    else {
      period = `${shortDate(p.startDate)} ~ ${shortDate(end)}`
      if (status === 'ongoing') period += ` · ${p.days}일 중 ${prescriptionDayNumber(p.startDate, data.planDate)}일째`
    }

    return (
      <li
        key={p.id}
        className={`rounded-xl border border-slate-200 bg-white p-4 ${status === 'finished' ? 'opacity-60' : ''}`}
      >
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex flex-wrap items-baseline gap-2">
              <h2 className="text-lg font-semibold">{p.name}</h2>
              <span className="text-sm text-slate-500">{period}</span>
            </div>
            <p className="mt-1 text-sm text-indigo-700">{describeTiming(p)}</p>
            <p className="mt-0.5 font-mono text-xs text-slate-500">
              {prescriptionTimes(p, data.settings).join(' · ')}
            </p>
            {p.memo && <p className="mt-1 text-sm text-slate-500">{p.memo}</p>}
          </div>
          <div className="flex shrink-0 gap-1 text-sm">
            <button
              type="button"
              onClick={() => setEditing({ mode: 'edit', prescription: p })}
              className="rounded px-2 py-1 text-indigo-600 hover:bg-indigo-50"
            >
              수정
            </button>
            {p.active ? (
              <button
                type="button"
                onClick={() => void setActive(p, false)}
                className="rounded px-2 py-1 text-slate-600 hover:bg-slate-100"
              >
                복용 종료
              </button>
            ) : (
              <button
                type="button"
                onClick={() => void setActive(p, true)}
                className="rounded px-2 py-1 text-slate-600 hover:bg-slate-100"
              >
                다시 복용
              </button>
            )}
            <button
              type="button"
              onClick={() => void remove(p)}
              className="rounded px-2 py-1 text-red-600 hover:bg-red-50"
            >
              삭제
            </button>
          </div>
        </div>
      </li>
    )
  }

  return (
    <div className="mx-auto max-w-3xl p-6">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-bold">처방약</h1>
        <button
          type="button"
          onClick={() => setEditing({ mode: 'create' })}
          className="rounded-lg bg-indigo-600 px-4 py-2 font-semibold text-white hover:bg-indigo-700"
        >
          + 처방약 추가
        </button>
      </div>

      {current.length > 0 && data.hasActiveSupplement && <PharmacistNotice />}

      <h2 className="mb-2 mt-4 font-semibold text-slate-600">복용 중</h2>
      {current.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center text-slate-500">
          복용 중인 처방약이 없습니다.
          <br />
          병원에서 약을 받으면 <b>+ 처방약 추가</b>로 약봉투에 적힌 대로 입력하세요.
        </div>
      ) : (
        <ul className="space-y-3">{current.map(card)}</ul>
      )}

      {finished.length > 0 && (
        <>
          <h2 className="mb-2 mt-6 font-semibold text-slate-600">복용 완료</h2>
          <ul className="space-y-3">{finished.map(card)}</ul>
        </>
      )}

      {editing && (
        <PrescriptionForm
          initial={editing.mode === 'edit' ? editing.prescription : undefined}
          defaultStartDate={data.planDate}
          onSaved={() => void onSaved()}
          onCancel={() => setEditing(null)}
        />
      )}
    </div>
  )
}
