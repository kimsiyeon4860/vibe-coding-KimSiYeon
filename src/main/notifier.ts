import { BrowserWindow, ipcMain, Notification, screen } from 'electron'
import { ALARM_ACTIONS, type AlarmAction, type AlarmItem } from '../shared/types'
import { loadPage, PRELOAD_PATH } from './loadPage'
import { createPillIcon } from './trayIcon'

const POPUP_WIDTH = 420
const POPUP_HEIGHT = 380

let alarmWindow: BrowserWindow | null = null
let currentItems: AlarmItem[] = []

/**
 * 알람을 울린다. 세 가지를 동시에 실행:
 *  1. Windows 토스트 알림
 *  2. 모든 창 위에 떠 있는 알람 팝업 창 (방해 금지 모드에서도 보임)
 *  3. 알림음 (팝업 화면이 열리면서 재생)
 */
export function showAlarm(items: AlarmItem[]): void {
  currentItems = items
  showToast(items)
  showPopup(items)
}

/** 팝업 창의 요청(항목 조회·버튼 응답)을 처리하도록 등록. 앱 시작 시 한 번 호출 */
export function registerAlarmHandlers(): void {
  ipcMain.handle('alarm:get-items', () => currentItems)

  ipcMain.on('alarm:respond', (_event, action: unknown) => {
    if (!ALARM_ACTIONS.includes(action as AlarmAction)) return
    // TODO(3단계): 복용 기록 저장, 스누즈 처리
    console.log(`[알람 응답] ${String(action)}:`, currentItems.map((i) => i.name).join(', '))
    closePopup()
  })
}

function showToast(items: AlarmItem[]): void {
  if (!Notification.isSupported()) return
  const toast = new Notification({
    title: '💊 복용 시간이에요',
    body: items.map((i) => `${i.time} ${i.name}`).join('\n'),
    icon: createPillIcon(),
    silent: true // 소리는 팝업에서 낸다
  })
  toast.on('click', () => bringToFront(alarmWindow))
  toast.show()
}

function showPopup(items: AlarmItem[]): void {
  // 이미 떠 있으면 내용만 바꾸고 다시 앞으로
  if (alarmWindow && !alarmWindow.isDestroyed()) {
    alarmWindow.webContents.send('alarm:items', items)
    bringToFront(alarmWindow)
    return
  }

  // 마우스가 있는 모니터(=사용자가 보고 있는 화면) 가운데에 띄운다
  const display = screen.getDisplayNearestPoint(screen.getCursorScreenPoint())
  const { x, y, width, height } = display.workArea

  alarmWindow = new BrowserWindow({
    width: POPUP_WIDTH,
    height: POPUP_HEIGHT,
    x: Math.round(x + (width - POPUP_WIDTH) / 2),
    y: Math.round(y + (height - POPUP_HEIGHT) / 2),
    frame: false, // X 버튼 없음: 팝업 버튼으로만 닫힌다
    resizable: false,
    minimizable: false,
    maximizable: false,
    alwaysOnTop: true,
    show: false,
    icon: createPillIcon(),
    title: '복용 알람',
    webPreferences: {
      preload: PRELOAD_PATH,
      sandbox: true,
      contextIsolation: true,
      // 사용자가 클릭하지 않아도 알림음이 재생되도록
      autoplayPolicy: 'no-user-gesture-required'
    }
  })
  // 'screen-saver' 단계: 일반 '항상 위' 창보다도 위에 표시
  alarmWindow.setAlwaysOnTop(true, 'screen-saver')

  alarmWindow.once('ready-to-show', () => bringToFront(alarmWindow))
  alarmWindow.on('closed', () => {
    alarmWindow = null
  })
  loadPage(alarmWindow, 'alarm')
}

function closePopup(): void {
  if (alarmWindow && !alarmWindow.isDestroyed()) alarmWindow.close()
  currentItems = []
}

function bringToFront(win: BrowserWindow | null): void {
  if (!win || win.isDestroyed()) return
  win.show()
  win.moveTop()
  win.focus()
  win.flashFrame(true) // 작업표시줄 아이콘 깜빡임
}
