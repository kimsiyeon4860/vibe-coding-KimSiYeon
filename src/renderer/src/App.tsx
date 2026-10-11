import { useState } from 'react'
import HistoryPage from './pages/HistoryPage'
import MedicinesPage from './pages/MedicinesPage'
import SettingsPage from './pages/SettingsPage'
import TodayPage from './pages/TodayPage'

// 화면은 3개: 오늘 복용(아래로 내리면 복용 기록) · 내 약(영양제+처방약) · 설정
const TABS = [
  { key: 'today', label: '오늘 복용' },
  { key: 'medicines', label: '내 약' },
  { key: 'settings', label: '설정' }
] as const

type TabKey = (typeof TABS)[number]['key']

export default function App() {
  const [tab, setTab] = useState<TabKey>('today')

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
      </header>

      <main className="flex-1 overflow-y-auto">
        {tab === 'today' && (
          <>
            <TodayPage />
            <div className="border-t border-slate-200">
              <HistoryPage />
            </div>
          </>
        )}
        {tab === 'medicines' && <MedicinesPage />}
        {tab === 'settings' && <SettingsPage />}
      </main>
    </div>
  )
}
