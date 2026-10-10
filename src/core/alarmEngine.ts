// 알람 판단 엔진 (데스크톱·웹 공통). 30초마다 evaluate()를 불러 지금 띄울 항목과 '울릴지'를 받는다.
// 띄우는 방법(항상 위 창 / 페이지 안 창 + 브라우저 알림)은 각 플랫폼이 맡는다.
import { decideRing, dueEntries, toAlarmItem, type RingState } from '../shared/alarm'
import { clockOf } from '../shared/schedule'
import type { AlarmAction, AlarmItem, AlarmState } from '../shared/types'
import type { SqlDatabase } from './db/sql'
import { getSettings } from './db/settings'
import { getTodayView, recordCheck } from './today'

export interface AlarmDecision {
  state: AlarmState
  /** false면 내용만 갱신, 객체면 '울린다' (sound면 알림음) */
  ring: false | { sound: boolean }
}

export interface AlarmEngine {
  evaluate: (now?: Date) => AlarmDecision
  /** 팝업 버튼: 팝업에 있던 모든 항목을 기록한다 */
  respond: (action: AlarmAction, items: AlarmItem[], now?: Date) => void
  /** 설정의 '테스트 알람': 다음 evaluate에서 가짜 항목과 함께 울린다 */
  testAlarm: (now?: Date) => void
}

export function createAlarmEngine(db: SqlDatabase): AlarmEngine {
  /** 지금 떠 있는 알람의 울림 상태 (재알림 횟수). 앱을 다시 켜면 처음부터 센다 */
  let ringState: RingState | null = null
  let testItem: AlarmItem | null = null
  let forceRing = false

  return {
    evaluate: (now = new Date()) => {
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
      return {
        state: { items, snoozeMinutes: settings.snoozeMinutes },
        ring: ring ? { sound: settings.alarmSound } : false
      }
    },

    respond: (action, items, now = new Date()) => {
      for (const item of items) {
        if (item.test) testItem = null
        else recordCheck(db, item.planDate, item.productId, item.slot, action, now)
      }
      ringState = null
    },

    testAlarm: (now = new Date()) => {
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
    }
  }
}
