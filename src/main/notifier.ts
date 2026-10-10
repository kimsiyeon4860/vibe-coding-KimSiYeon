// 알람 표시: Windows 토스트 + 항상 위 팝업 창 + 알림음. 무엇을 언제 띄울지는 scheduler.ts가 정한다.
import { BrowserWindow, ipcMain, Notification, screen } from 'electron'
import { ALARM_ACTIONS, type AlarmAction, type AlarmItem, type AlarmState } from '../shared/types'
import { loadPage, PRELOAD_PATH } from './loadPage'
import { createPillIcon } from './trayIcon'

const POPUP_WIDTH = 420
const POPUP_HEIGHT = 400

/** 팝업 버튼을 눌렀을 때 호출된다 (팝업에 있던 모든 항목에 적용) */
export type AlarmResponder = (action: AlarmAction, items: AlarmItem[]) => void

let alarmWindow: BrowserWindow | null = null
let state: AlarmState = { items: [], snoozeMinutes: 10 }
/** 팝업 화면(React)이 이벤트를 받을 준비가 됐는지 */
let popupReady = false
/** 팝업이 준비되기 전에 울린 소리 → 준비되면 재생 */
let pendingSound = false
let responder: AlarmResponder = () => {}

export function setAlarmResponder(fn: AlarmResponder): void {
  responder = fn
}

/**
 * 팝업 내용을 바꾼다. 항목이 없으면 팝업을 닫는다.
 * @param ring false면 내용만 조용히 바꾼다. 객체면 '울린다': 토스트 + 팝업을 맨 앞으로 + (sound면) 알림음
 */
export function presentAlarm(next: AlarmState, ring: false | { sound: boolean }): void {
  if (next.items.length === 0) {
    closePopup()
    return
  }
  state = next

  const isOpen = alarmWindow !== null && !alarmWindow.isDestroyed()
  if (isOpen) alarmWindow?.webContents.send('alarm:state', state)
  else createPopup() // 새 창은 화면이 그려지면(ready-to-show) 스스로 맨 앞으로 온다

  if (ring) {
    showToast(state.items)
    if (isOpen) bringToFront(alarmWindow)
    if (ring.sound) playSound()
  }
}

/** 팝업 창의 요청을 처리하도록 등록. 앱 시작 시 한 번 호출 */
export function registerAlarmHandlers(): void {
  ipcMain.handle('alarm:ready', () => {
    popupReady = true
    const ringNow = pendingSound
    pendingSound = false
    return { ...state, ringNow }
  })

  ipcMain.on('alarm:respond', (_event, action: unknown) => {
    if (!ALARM_ACTIONS.includes(action as AlarmAction)) return
    const items = state.items
    closePopup()
    responder(action as AlarmAction, items)
  })
}

function playSound(): void {
  if (alarmWindow && popupReady) alarmWindow.webContents.send('alarm:ring')
  else pendingSound = true
}

function showToast(items: AlarmItem[]): void {
  if (!Notification.isSupported()) return
  const toast = new Notification({
    title: '💊 복용 시간이에요',
    body: items.map((i) => `${i.time} ${i.productName}`).join('\n'),
    icon: createPillIcon(),
    silent: true // 소리는 팝업에서 낸다
  })
  toast.on('click', () => bringToFront(alarmWindow))
  toast.show()
}

function createPopup(): void {
  // 마우스가 있는 모니터(=사용자가 보고 있는 화면) 가운데에 띄운다
  const display = screen.getDisplayNearestPoint(screen.getCursorScreenPoint())
  const { x, y, width, height } = display.workArea

  const win = new BrowserWindow({
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
  win.setAlwaysOnTop(true, 'screen-saver')

  win.once('ready-to-show', () => bringToFront(win))
  win.on('closed', () => {
    if (alarmWindow === win) {
      alarmWindow = null
      popupReady = false
      pendingSound = false
    }
  })
  alarmWindow = win
  popupReady = false
  loadPage(win, 'alarm')
}

function closePopup(): void {
  state = { ...state, items: [] }
  if (alarmWindow && !alarmWindow.isDestroyed()) alarmWindow.close()
}

function bringToFront(win: BrowserWindow | null): void {
  if (!win || win.isDestroyed()) return
  win.show()
  win.moveTop()
  win.focus()
  win.flashFrame(true) // 작업표시줄 아이콘 깜빡임
}
