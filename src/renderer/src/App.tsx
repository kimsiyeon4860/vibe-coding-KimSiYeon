import { useCallback, useEffect, useState } from 'react'
import HistoryPage from './pages/HistoryPage'
import MedicinesPage from './pages/MedicinesPage'
import SettingsPage from './pages/SettingsPage'
import TodayPage from './pages/TodayPage'

// 화면은 3개: 오늘 복용 · 내 약(영양제+처방약) · 기록. 설정은 머리글의 톱니 버튼으로 여는 창
const TABS = [
  { key: 'today', label: '오늘 복용' },
  { key: 'medicines', label: '내 약' },
  { key: 'history', label: '기록' }
] as const

type TabKey = (typeof TABS)[number]['key']

export default function App() {
  const [tab, setTab] = useState<TabKey>('today')
  const [settingsOpen, setSettingsOpen] = useState(false)
  // 설정 창을 닫으면 화면을 다시 그려 바뀐 설정(생활 시간 등)을 반영한다
  const [refreshKey, setRefreshKey] = useState(0)

  const closeSettings = useCallback(() => {
    setSettingsOpen(false)
    setRefreshKey((k) => k + 1)
  }, [])

  useEffect(() => {
    if (!settingsOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeSettings()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [settingsOpen, closeSettings])

  return (
    <div className="flex h-full flex-col bg-slate-50 text-slate-800">
      <header className="flex items-center gap-2 border-b border-slate-200 bg-white px-3 sm:gap-6 sm:px-6">
        <span className="shrink-0 py-3 text-lg font-bold">
          💊<span className="hidden sm:inline"> PillMate</span>
        </span>
        <nav className="flex min-w-0 gap-1 overflow-x-auto">
          {TABS.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              className={`shrink-0 whitespace-nowrap border-b-2 px-3 py-3 font-medium sm:px-4 ${
                tab === t.key
                  ? 'border-indigo-600 text-indigo-600'
                  : 'border-transparent text-slate-500 hover:text-slate-800'
              }`}
            >
              {t.label}
            </button>
          ))}
        </nav>
        <button
          type="button"
          onClick={() => setSettingsOpen(true)}
          aria-label="설정"
          className="ml-auto shrink-0 rounded-lg px-3 py-2 text-slate-500 hover:bg-slate-100 hover:text-slate-800"
        >
          ⚙<span className="hidden sm:inline"> 설정</span>
        </button>
      </header>

      <main key={refreshKey} className="flex-1 overflow-y-auto">
        {tab === 'today' && <TodayPage />}
        {tab === 'medicines' && <MedicinesPage />}
        {tab === 'history' && <HistoryPage />}
      </main>

      {settingsOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="설정"
          className="fixed inset-0 z-30 flex justify-center overflow-y-auto bg-black/40 p-2 sm:p-6"
          onClick={(e) => {
            if (e.target === e.currentTarget) closeSettings()
          }}
        >
          <div className="h-fit w-full max-w-2xl rounded-xl bg-slate-50 shadow-xl">
            <div className="sticky top-0 flex items-center justify-between rounded-t-xl border-b border-slate-200 bg-white px-5 py-3">
              <h1 className="text-lg font-bold">⚙ 설정</h1>
              <button
                type="button"
                onClick={closeSettings}
                className="rounded-lg px-3 py-1.5 font-medium text-slate-600 hover:bg-slate-100"
              >
                닫기
              </button>
            </div>
            <SettingsPage />
          </div>
        </div>
      )}
    </div>
  )
}
