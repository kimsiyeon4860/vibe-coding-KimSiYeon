// 알람 스케줄러: 30초마다 오늘 목록을 확인해 시간이 된 항목을 알람 팝업으로 띄운다.
// 판단은 shared/alarm.ts의 순수 함수가 하고, 여기서는 타이머·절전 복귀·응답 기록만 맡는다.
import { powerMonitor } from 'electron'
import type { DatabaseSync } from 'node:sqlite'
import { decideRing, dueEntries, toAlarmItem, type RingState } from '../shared/alarm'
import { clockOf } from '../shared/schedule'
import type { AlarmItem } from '../shared/types'
import { getSettings } from './db/settings'
import { presentAlarm, setAlarmResponder } from './notifier'
import { getTodayView, recordCheck } from './today'

const TICK_MS = 30_000
/** 절전에서 깨어난 직후에는 화면·네트워크가 덜 깨어 있을 수 있어 잠깐 기다린다 */
const RESUME_DELAY_MS = 3_000

export interface Scheduler {
  /** 기록·설정·영양제가 바뀌었을 때 바로 다시 확인 */
  refresh: () => void
  /** 설정의 '테스트 알람' */
  testAlarm: () => void
  stop: () => void
}

/**
 * @param onRecorded 알람 응답으로 복용 기록이 바뀌었을 때 (오늘 탭 새로고침용)
 */
export function startScheduler(db: DatabaseSync, onRecorded: () => void): Scheduler {
  /** 지금 떠 있는 알람의 울림 상태 (재알림 횟수). 앱을 다시 켜면 처음부터 센다 */
  let ringState: RingState | null = null
  let testItem: AlarmItem | null = null
  let forceRing = false

  const tick = (): void => {
    try {
      const now = new Date()
      const settings = getSettings(db)
      const view = getTodayView(db, now)
      const items = dueEntries(view.entries, now).map((e) => toAlarmItem(view.planDate, e))
      if (testItem) items.unshift(testItem)

      const decision = decideRing(
        ringState,
        items.map((i) => i.key),
        now,
        settings
      )
      ringState = decision.state
      const ring = decision.ring || forceRing
      forceRing = false

      presentAlarm({ items, snoozeMinutes: settings.snoozeMinutes }, ring ? { sound: settings.alarmSound } : false)
    } catch (error) {
      // 한 번 실패해도 타이머는 계속 돈다
      console.error('[스케줄러] 확인 중 오류', error)
    }
  }

  // 팝업 버튼: 팝업에 있던 모든 항목을 기록한다
  setAlarmResponder((action, items) => {
    const now = new Date()
    for (const item of items) {
      if (item.test) testItem = null
      else recordCheck(db, item.planDate, item.productId, item.slot, action, now)
    }
    ringState = null
    onRecorded()
    tick()
  })

  const timer = setInterval(tick, TICK_MS)
  // 절전·최대 절전에서 깨어나거나 잠금을 풀면 바로 확인 → 그동안 놓친 알람을 모아서 띄운다
  const onResume = () => setTimeout(tick, RESUME_DELAY_MS)
  powerMonitor.on('resume', onResume)
  powerMonitor.on('unlock-screen', tick)
  tick() // 앱을 켜자마자 한 번 (꺼져 있던 동안 놓친 알람)

  return {
    refresh: tick,
    testAlarm: () => {
      const now = new Date()
      testItem = {
        key: 'test',
        planDate: '',
        productId: 0,
        slot: 'wake',
        productName: '테스트 알람',
        kind: 'supplement',
        dose: '알람이 잘 보이고 들리는지 확인하는 테스트입니다',
        time: clockOf(now.toISOString()),
        scheduledAt: now.toISOString(),
        test: true
      }
      forceRing = true
      tick()
    },
    stop: () => {
      clearInterval(timer)
      powerMonitor.off('resume', onResume)
      powerMonitor.off('unlock-screen', tick)
    }
  }
}
