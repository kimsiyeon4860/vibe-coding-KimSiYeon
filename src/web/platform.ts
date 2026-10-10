// 웹판 플랫폼: 브라우저 안에서 window.api를 만들고, 30초 타이머로 알람·기상·식사 확인을 돌린다.
// 판단은 데스크톱과 같은 core(alarmEngine, promptEngine, api)가 하고, 여기서는 '어떻게 보여줄지'만 맡는다.
//  - 알람: 페이지 안 알람 창 + 브라우저 알림(허용 시) + 소리 + 탭 제목 깜빡임
//  - 확인 창: 페이지 안 작은 창
// 한계: 탭이 열려 있어야 동작한다 (백그라운드 탭은 타이머가 1분 정도로 느려질 수 있다).
import type { Database, SqlJsStatic } from 'sql.js'
import { createAlarmEngine } from '../core/alarmEngine'
import { createCoreApi } from '../core/api'
import { MIGRATIONS } from '../core/db/migrations'
import type { SqlDatabase } from '../core/db/sql'
import { createPromptEngine, type PromptRequest } from '../core/promptEngine'
import { playChime } from '../renderer/src/chime'
import { LIFE_EVENT_LABELS, type AlarmState, type NotificationStatus, type PillMateApi } from '../shared/types'
import { exportDatabase } from './sqljsDatabase'
import { loadSearchKeys, SAMPLE_FOOD_SAFETY_KEY, saveDbFile, saveSearchKeys } from './storage'

const TICK_MS = 30_000
const APP_TITLE = 'PillMate'

/** 화면(WebRoot)이 구독하는 상태: 지금 알람 창·확인 창을 띄울지 */
export interface OverlayState {
  alarmOpen: boolean
  prompt: PromptRequest | null
}

export interface WebPlatform {
  api: PillMateApi
  getOverlay: () => OverlayState
  onOverlayChange: (listener: () => void) => () => void
}

/** 아주 작은 이벤트 도구 */
function emitter<T extends unknown[]>() {
  const listeners = new Set<(...args: T) => void>()
  return {
    on: (fn: (...args: T) => void) => {
      listeners.add(fn)
      return () => {
        listeners.delete(fn)
      }
    },
    emit: (...args: T) => listeners.forEach((fn) => fn(...args))
  }
}

const notificationStatus = (): NotificationStatus =>
  typeof Notification === 'undefined' ? 'unsupported' : (Notification.permission as NotificationStatus)

/** 브라우저 알림 (허용된 경우만). 누르면 이 탭으로 돌아온다 */
function notify(title: string, body: string, tag: string): void {
  if (notificationStatus() !== 'granted') return
  try {
    const n = new Notification(title, { body, tag, requireInteraction: true })
    n.onclick = () => {
      window.focus()
      n.close()
    }
  } catch {
    // 일부 환경(모바일 등)은 페이지에서 직접 알림을 만들 수 없다
  }
}

/**
 * @param raw sql.js 원본 DB (백업 내보내기용)
 * @param SQL sql.js 모듈 (백업 불러오기 검사용)
 */
export function createWebPlatform(db: SqlDatabase, raw: Database, SQL: SqlJsStatic): WebPlatform {
  const alarmEngine = createAlarmEngine(db)
  const promptEngine = createPromptEngine(db)

  const overlayChanged = emitter<[]>()
  const todayChanged = emitter<[]>()
  const alarmStateChanged = emitter<[AlarmState]>()
  const ringRequested = emitter<[]>()

  let overlay: OverlayState = { alarmOpen: false, prompt: null }
  let alarmState: AlarmState = { items: [], snoozeMinutes: 10 }
  /** 알람 창이 아직 그려지기 전에 울린 소리 → 창이 준비되면(ready) 재생 */
  let pendingSound = false
  let titleBlink: ReturnType<typeof setInterval> | null = null

  const setOverlay = (next: Partial<OverlayState>) => {
    overlay = { ...overlay, ...next }
    overlayChanged.emit()
  }

  const startTitleBlink = () => {
    if (titleBlink) return
    let on = false
    titleBlink = setInterval(() => {
      on = !on
      document.title = on ? '💊 복용 시간이에요!' : APP_TITLE
    }, 1000)
  }
  const stopTitleBlink = () => {
    if (titleBlink) clearInterval(titleBlink)
    titleBlink = null
    document.title = APP_TITLE
  }

  const userActive = () => document.visibilityState === 'visible' && document.hasFocus()

  const tick = () => {
    try {
      const { state, ring } = alarmEngine.evaluate()
      if (state.items.length === 0) {
        if (overlay.alarmOpen) setOverlay({ alarmOpen: false })
        stopTitleBlink()
      } else {
        alarmState = state
        const wasOpen = overlay.alarmOpen
        if (wasOpen) alarmStateChanged.emit(state)
        else setOverlay({ alarmOpen: true })
        if (ring) {
          notify('💊 복용 시간이에요', state.items.map((i) => `${i.time} ${i.productName}`).join('\n'), 'pillmate-alarm')
          startTitleBlink()
          if (ring.sound) {
            // 창이 이미 떠 있으면 바로, 막 여는 중이면 창이 준비됐을 때(ready) 재생
            if (wasOpen) ringRequested.emit()
            else pendingSound = true
          }
        }
      }

      if (!overlay.prompt && !overlay.alarmOpen) {
        const next = promptEngine.next(new Date(), userActive())
        if (next) {
          setOverlay({ prompt: next })
          if (next.kind === 'meal') {
            const meal = LIFE_EVENT_LABELS[next.event].replace(' 먹어요', '')
            notify(`🍚 ${meal} 드셨어요?`, '식사에 맞춰 먹는 약이 있어요. 드셨으면 기록해 주세요.', 'pillmate-meal')
          }
        }
      }
    } catch (error) {
      // 한 번 실패해도 타이머는 계속 돈다
      console.error('[PillMate] 확인 중 오류', error)
    }
  }

  const core = createCoreApi(db, {
    onChanged: () => setTimeout(tick, 0),
    searchKeys: () => {
      const keys = loadSearchKeys()
      return { foodSafety: keys.foodSafety, dataGoKr: keys.dataGoKr }
    }
  })

  const afterRecorded = () => {
    todayChanged.emit()
    setTimeout(tick, 0)
  }

  const api: PillMateApi = {
    platform: 'web',

    supplements: {
      list: async () => core.supplements.list(),
      create: async (draft) => core.supplements.create(draft),
      update: async (id, draft) => core.supplements.update(id, draft),
      setActive: async (id, active) => core.supplements.setActive(id, active),
      remove: async (id) => core.supplements.remove(id),
      applySchedule: async (changes) => core.supplements.applySchedule(changes)
    },
    prescriptions: {
      list: async () => core.prescriptions.list(),
      create: async (draft) => core.prescriptions.create(draft),
      update: async (id, draft) => core.prescriptions.update(id, draft),
      setActive: async (id, active) => core.prescriptions.setActive(id, active),
      remove: async (id) => core.prescriptions.remove(id)
    },
    settings: {
      get: async () => core.settings.get(),
      save: async (settings) => core.settings.save(settings)
    },
    today: {
      get: async () => core.today.get(),
      check: async (planDate, productId, slot, action) => core.today.check(planDate, productId, slot, action),
      undo: async (planDate, productId, slot) => core.today.undo(planDate, productId, slot),
      onChanged: (callback) => todayChanged.on(callback),
      recordEvent: async (planDate, event, time) => core.today.recordEvent(planDate, event, time),
      clearEvent: async (planDate, event) => core.today.clearEvent(planDate, event),
      skipEvent: async (planDate, meal) => core.today.skipEvent(planDate, meal)
    },
    stats: { get: async (days) => core.stats.get(days) },
    search: { supplements: (name, manufacturer) => core.search.supplements(name, manufacturer) },

    prompt: {
      info: async () => (overlay.prompt ? promptEngine.info(overlay.prompt) : (null as never)),
      respond: (answer) => {
        const asked = overlay.prompt
        setOverlay({ prompt: null })
        if (asked && promptEngine.answer(asked, answer)) afterRecorded()
      }
    },

    app: {
      // 웹판에는 .env가 없어서 설정 탭이 WebOnlyApi로 키를 보여준다. 이 값은 호환용
      envInfo: async () => {
        const keys = loadSearchKeys()
        return {
          hasSearchKey: keys.foodSafety !== '',
          isSampleKey: keys.foodSafety === SAMPLE_FOOD_SAFETY_KEY,
          hasDrugKey: keys.dataGoKr !== '',
          envPath: '이 브라우저',
          isPackaged: false
        }
      },
      openEnvFolder: async () => {}
    },

    testAlarm: () => {
      alarmEngine.testAlarm()
      tick()
    },

    alarm: {
      ready: async () => {
        const ringNow = pendingSound
        pendingSound = false
        return { ...alarmState, ringNow }
      },
      onState: (callback) => alarmStateChanged.on(callback),
      onRing: (callback) => ringRequested.on(callback),
      respond: (action) => {
        const items = alarmState.items
        alarmState = { ...alarmState, items: [] }
        setOverlay({ alarmOpen: false })
        stopTitleBlink()
        alarmEngine.respond(action, items)
        afterRecorded()
      }
    },

    web: {
      getKeys: async () => loadSearchKeys(),
      setKeys: async (keys) => saveSearchKeys({ foodSafety: keys.foodSafety.trim(), dataGoKr: keys.dataGoKr.trim() }),
      exportBackup: async () => exportDatabase(raw),
      importBackup: async (bytes) => {
        try {
          const test = new SQL.Database(bytes)
          const userVersion = Number(test.exec('PRAGMA user_version')[0]?.values[0]?.[0] ?? 0)
          const hasProducts = test.exec("SELECT name FROM sqlite_master WHERE type='table' AND name='products'").length > 0
          test.close()
          if (!hasProducts || userVersion < 1) return { ok: false, error: 'PillMate 백업 파일이 아닙니다' }
          if (userVersion > MIGRATIONS.length) {
            return { ok: false, error: '더 새 버전의 PillMate에서 만든 백업입니다. 페이지를 새로고침한 뒤 다시 시도해 주세요' }
          }
          await saveDbFile(bytes)
          location.reload()
          return { ok: true }
        } catch {
          return { ok: false, error: '백업 파일을 읽지 못했습니다' }
        }
      },
      notificationStatus,
      enableNotifications: async () => {
        playChime() // 사용자가 누른 버튼 안에서 소리를 한 번 내야 이후 알림음이 막히지 않는다
        if (notificationStatus() === 'default') await Notification.requestPermission()
        return notificationStatus()
      }
    }
  }

  // 30초마다, 그리고 탭으로 돌아오거나 창이 활성화될 때(절전 복귀 포함) 바로 확인
  setInterval(tick, TICK_MS)
  document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && tick())
  window.addEventListener('focus', tick)
  setTimeout(tick, 500) // 열자마자 한 번 (닫혀 있던 동안 놓친 알람)

  return {
    api,
    getOverlay: () => overlay,
    onOverlayChange: (listener) => overlayChanged.on(listener)
  }
}
