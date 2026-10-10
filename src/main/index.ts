import { join } from 'node:path'
import type { DatabaseSync } from 'node:sqlite'
import { app, BrowserWindow, ipcMain, Menu, Tray } from 'electron'
import type { AlarmItem } from '../shared/types'
import { openDatabase } from './db/connection'
import { loadPage, PRELOAD_PATH } from './loadPage'
import { registerAlarmHandlers, showAlarm } from './notifier'
import { registerScheduleHandlers } from './scheduleHandlers'
import { registerSupplementHandlers } from './supplementHandlers'
import { createPillIcon } from './trayIcon'

// Windows 토스트 알림이 표시되려면 앱 ID가 필요하다
const APP_ID = 'com.pillmate.app'

let mainWindow: BrowserWindow | null = null
let tray: Tray | null = null
let db: DatabaseSync | null = null
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
  setupAutoLaunch()

  // DB 파일 위치: %APPDATA%\PillMate\pillmate.db
  db = openDatabase(join(app.getPath('userData'), 'pillmate.db'))
  registerSupplementHandlers(db)
  registerScheduleHandlers(db)
  registerAlarmHandlers()
  ipcMain.on('alarm:test', triggerTestAlarm)

  createTray()
  // Windows 시작 시 자동 실행된 경우(--minimized)에는 트레이에만 둔다
  createMainWindow(!process.argv.includes('--minimized'))
}

// 창이 모두 닫혀도 앱은 트레이에서 계속 실행 (기본 동작인 '종료'를 막음)
app.on('window-all-closed', () => {})

app.on('before-quit', () => {
  isQuitting = true
})

app.on('will-quit', () => {
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
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: '열기', click: showMainWindow },
      { label: '테스트 알람 울리기', click: triggerTestAlarm },
      { type: 'separator' },
      { label: '종료', click: () => app.quit() }
    ])
  )
  tray.on('click', showMainWindow)
}

/** Windows 로그인 시 자동 실행. 개발 모드에서는 개발용 Electron이 등록되므로 설치된 앱에서만 켠다 */
function setupAutoLaunch(): void {
  if (!app.isPackaged) return
  app.setLoginItemSettings({ openAtLogin: true, args: ['--minimized'] })
}

function triggerTestAlarm(): void {
  const now = new Intl.DateTimeFormat('ko-KR', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: 'Asia/Seoul'
  }).format(new Date())

  const items: AlarmItem[] = [
    { id: 'test', name: '테스트 알람', time: now, note: '알람이 잘 보이고 들리는지 확인하는 테스트입니다' }
  ]
  showAlarm(items)
}
