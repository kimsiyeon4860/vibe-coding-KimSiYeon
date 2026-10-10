import { useState } from 'react'
import HistoryPage from './pages/HistoryPage'
import PrescriptionsPage from './pages/PrescriptionsPage'
import SettingsPage from './pages/SettingsPage'
import SupplementsPage from './pages/SupplementsPage'
import TodayPage from './pages/TodayPage'

const TABS = [
  { key: 'today', label: '오늘 복용' },
  { key: 'supplements', label: '영양제' },
  { key: 'prescriptions', label: '처방약' },
  { key: 'history', label: '기록' },
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
        {tab === 'today' && <TodayPage />}
        {tab === 'supplements' && <SupplementsPage />}
        {tab === 'prescriptions' && <PrescriptionsPage />}
        {tab === 'history' && <HistoryPage />}
        {tab === 'settings' && <SettingsPage />}
      </main>
    </div>
  )
}
