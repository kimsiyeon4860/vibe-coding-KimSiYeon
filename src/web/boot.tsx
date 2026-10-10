// 웹판 시작: sql.js(브라우저용 SQLite)를 띄우고, 저장된 DB를 불러와 window.api를 만든 뒤 화면을 그린다.
import initSqlJs from 'sql.js'
import wasmUrl from 'sql.js/dist/sql-wasm.wasm?url'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { initDatabase } from '../core/db/init'
import '../renderer/src/index.css'
import { createWebPlatform } from './platform'
import { exportDatabase, wrapSqlJs } from './sqljsDatabase'
import { loadDbFile, saveDbFile } from './storage'
import WebRoot from './WebRoot'

const SAVE_DELAY_MS = 300

function showMessage(text: string): void {
  const root = document.getElementById('root')!
  root.innerHTML = ''
  const p = document.createElement('p')
  p.className = 'mx-auto mt-20 max-w-md rounded-xl border border-amber-300 bg-amber-50 p-6 text-center text-amber-900'
  p.textContent = text
  root.appendChild(p)
}

/** 같은 브라우저에서 PillMate 탭은 하나만 (두 탭이 따로 저장하면 기록이 덮어써진다) */
async function acquireSingleTab(): Promise<boolean> {
  if (!('locks' in navigator)) return true
  return new Promise((resolve) => {
    void navigator.locks.request('pillmate-tab', { ifAvailable: true }, (lock) => {
      if (!lock) {
        resolve(false)
        return
      }
      resolve(true)
      return new Promise<void>(() => {}) // 탭이 닫힐 때까지 잠금 유지
    })
  })
}

async function boot(): Promise<void> {
  if (!(await acquireSingleTab())) {
    showMessage('PillMate가 이미 다른 탭에서 열려 있어요. 그 탭을 사용해 주세요. (두 탭에서 동시에 쓰면 기록이 덮어써질 수 있습니다)')
    return
  }

  const SQL = await initSqlJs({ locateFile: () => wasmUrl })
  let saved: Uint8Array | null = null
  try {
    saved = await loadDbFile()
  } catch (error) {
    console.error('[PillMate] 저장된 데이터를 읽지 못했습니다', error)
  }

  let raw = new SQL.Database(saved ?? undefined)
  let saveTimer: ReturnType<typeof setTimeout> | undefined
  const save = () => void saveDbFile(exportDatabase(raw)).catch((e) => console.error('[PillMate] 저장 실패', e))
  const scheduleSave = () => {
    clearTimeout(saveTimer)
    saveTimer = setTimeout(save, SAVE_DELAY_MS)
  }

  let db
  try {
    db = initDatabase(wrapSqlJs(raw, scheduleSave))
  } catch (error) {
    // 저장된 DB가 깨졌으면 새로 시작 (원본은 덮어쓰기 전까지 남아 있으니 개발자 도구로 복구 가능)
    console.error('[PillMate] 저장된 데이터가 손상되어 새로 시작합니다', error)
    raw = new SQL.Database()
    db = initDatabase(wrapSqlJs(raw, scheduleSave))
  }
  save()
  // 탭을 닫거나 숨길 때 기다리던 저장을 바로 한다
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden' && saveTimer) {
      clearTimeout(saveTimer)
      save()
    }
  })

  const platform = createWebPlatform(db, raw, SQL)
  window.api = platform.api

  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <WebRoot platform={platform} />
    </StrictMode>
  )
}

void boot().catch((error) => {
  console.error(error)
  showMessage('PillMate를 시작하지 못했습니다. 최신 Chrome·Edge에서 다시 열어 주세요.')
})
