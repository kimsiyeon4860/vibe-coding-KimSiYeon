import { join } from 'node:path'
import type { DatabaseSync } from 'node:sqlite'
import { app, BrowserWindow, ipcMain, Menu, Tray, type MenuItemConstructorOptions } from 'electron'
import { clockOf, planDateFor } from '../shared/schedule'
import { LIFE_EVENT_LABELS, LIFE_EVENTS, type LifeEvent } from '../shared/types'
import { registerAppHandlers } from './appHandlers'
import { applyAutoLaunch } from './autoLaunch'
import { openDatabase } from './db/connection'
import { getSettings } from './db/settings'
import { loadEnv } from './env'
import { loadPage, PRELOAD_PATH } from './loadPage'
import { registerAlarmHandlers } from './notifier'
import { registerPrescriptionHandlers } from './prescriptionHandlers'
import { registerScheduleHandlers } from './scheduleHandlers'
import { registerSearchHandlers } from './searchHandlers'
import { startScheduler, type Scheduler } from './scheduler'
import { getTodayView, recordLifeEvent } from './today'
import { createWakePrompter, type WakePrompter } from './wakePrompt'
import { registerSupplementHandlers } from './supplementHandlers'
import { createPillIcon } from './trayIcon'

// Windows 토스트 알림이 표시되려면 앱 ID가 필요하다
const APP_ID = 'com.pillmate.app'

let mainWindow: BrowserWindow | null = null
let tray: Tray | null = null
let db: DatabaseSync | null = null
let scheduler: Scheduler | null = null
/** true일 때만 창을 진짜로 닫는다 (트레이 메뉴 "종료") */
let isQuitting = false

// 앱은 하나만 실행: 이미 실행 중이면 기존 창을 띄우고 새 실행은 종료
if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', showMainWindow)
  app.whenReady().then(start)
}

function start(): void {
  app.setAppUserModelId(APP_ID)
  loadEnv()

  // DB 파일 위치: %APPDATA%\PillMate\pillmate.db
  db = openDatabase(join(app.getPath('userData'), 'pillmate.db'))
  applyAutoLaunch(getSettings(db).autoLaunch)

  createTray()
  // Windows 시작 시 자동 실행된 경우(--minimized)에는 트레이에만 둔다
  createMainWindow(!process.argv.includes('--minimized'))

  registerAlarmHandlers()
  // 알람 응답·기상 기록으로 오늘 기록이 바뀌면 열려 있는 오늘 탭을 새로고침
  const notifyTodayChanged = () => mainWindow?.webContents.send('today:changed')
  let wakePrompter: WakePrompter | null = null
  // 30초마다: 알람 확인 + 기상 기록 묻기 + 트레이 메뉴(생활 기록 표시) 갱신
  const activeScheduler = startScheduler(db, notifyTodayChanged, () => {
    wakePrompter?.check()
    updateTrayMenu()
  })
  scheduler = activeScheduler
  wakePrompter = createWakePrompter(db, () => {
    activeScheduler.refresh()
    notifyTodayChanged()
  })
  wakePrompter.check()
  registerSupplementHandlers(db, activeScheduler.refresh)
  registerPrescriptionHandlers(db, activeScheduler.refresh)
  registerSearchHandlers()
  registerAppHandlers()
  registerScheduleHandlers(db, activeScheduler.refresh)
  ipcMain.on('alarm:test', activeScheduler.testAlarm)
}

// 창이 모두 닫혀도 앱은 트레이에서 계속 실행 (기본 동작인 '종료'를 막음)
app.on('window-all-closed', () => {})

app.on('before-quit', () => {
  isQuitting = true
})

app.on('will-quit', () => {
  scheduler?.stop()
  db?.close()
  db = null
})

function createMainWindow(visible: boolean): void {
  mainWindow = new BrowserWindow({
    width: 900,
    height: 640,
    minWidth: 640,
    minHeight: 480,
    show: false,
    icon: createPillIcon(),
    title: 'PillMate',
    autoHideMenuBar: true,
    webPreferences: {
      preload: PRELOAD_PATH,
      sandbox: true,
      contextIsolation: true
    }
  })

  if (visible) mainWindow.once('ready-to-show', () => mainWindow?.show())

  // X 버튼: 종료하지 않고 트레이로 숨김
  mainWindow.on('close', (event) => {
    if (isQuitting) return
    event.preventDefault()
    mainWindow?.hide()
  })

  loadPage(mainWindow, 'index')
}

function showMainWindow(): void {
  if (!mainWindow) return
  if (mainWindow.isMinimized()) mainWindow.restore()
  mainWindow.show()
  mainWindow.focus()
}

function createTray(): void {
  tray = new Tray(createPillIcon())
  tray.setToolTip('PillMate — 복용 알람')
  updateTrayMenu()
  tray.on('click', showMainWindow)
}

/** 마지막으로 만든 트레이 메뉴의 생활 기록 표시 (바뀔 때만 다시 만든다) */
let lastTrayEvents = ''

/** 트레이 메뉴: 열기 / 생활 기록 버튼('클릭 기록' 모드인 것만) / 테스트 알람 / 종료 */
function updateTrayMenu(): void {
  if (!tray || !db) return
  const activeDb = db
  const settings = getSettings(activeDb)
  const events = getTodayView(activeDb).events
  const clickEvents = LIFE_EVENTS.filter((e) => settings.eventModes[e] === 'click')

  const record = (event: LifeEvent) => {
    // 메뉴를 만든 뒤 날짜가 바뀌었을 수 있으니 누른 순간의 복용일로 기록
    recordLifeEvent(activeDb, planDateFor(new Date(), getSettings(activeDb)), event)
    scheduler?.refresh()
    mainWindow?.webContents.send('today:changed')
  }
  const eventItems: MenuItemConstructorOptions[] = clickEvents.map((event) => {
    const at = events[event]
    return at
      ? { label: `${LIFE_EVENT_LABELS[event]}   ✓ ${clockOf(at)}`, enabled: false }
      : { label: LIFE_EVENT_LABELS[event], click: () => record(event) }
  })

  const signature = JSON.stringify(eventItems.map((i) => i.label))
  if (signature === lastTrayEvents) return
  lastTrayEvents = signature

  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: '열기', click: showMainWindow },
      { type: 'separator' },
      ...(eventItems.length > 0
        ? [{ label: '생활 기록 (지금)', enabled: false }, ...eventItems, { type: 'separator' as const }]
        : []),
      { label: '테스트 알람 울리기', click: () => scheduler?.testAlarm() },
      { type: 'separator' },
      { label: '종료', click: () => app.quit() }
    ])
  )
}
