// 데스크톱 알람 스케줄러: 30초 타이머·절전 복귀·잠금 해제 때 core/alarmEngine에 물어보고
// 결과를 notifier(항상 위 창 + Windows 알림)로 띄운다.
import { powerMonitor } from 'electron'
import { createAlarmEngine } from '../core/alarmEngine'
import type { SqlDatabase } from '../core/db/sql'
import { presentAlarm, setAlarmResponder } from './notifier'

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
 * @param onTick 확인할 때마다 함께 할 일 (기상·식사 기록 묻기, 트레이 메뉴 갱신)
 */
export function startScheduler(db: SqlDatabase, onRecorded: () => void, onTick: () => void = () => {}): Scheduler {
  const engine = createAlarmEngine(db)

  const tick = (): void => {
    try {
      const { state, ring } = engine.evaluate()
      presentAlarm(state, ring)
      onTick()
    } catch (error) {
      // 한 번 실패해도 타이머는 계속 돈다
      console.error('[스케줄러] 확인 중 오류', error)
    }
  }

  setAlarmResponder((action, items) => {
    engine.respond(action, items)
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
      engine.testAlarm()
      tick()
    },
    stop: () => {
      clearInterval(timer)
      powerMonitor.off('resume', onResume)
      powerMonitor.off('unlock-screen', tick)
    }
  }
}
