// 메인 프로세스·preload·화면이 함께 쓰는 타입

/** 알람 팝업에 표시할 복용 항목 하나 */
export interface AlarmItem {
  id: string
  name: string
  /** 예정 시각 "HH:mm" */
  time: string
  note?: string
}

/** 알람 팝업 버튼: 먹었어요 / 10분 뒤 다시 / 건너뛰기 */
export type AlarmAction = 'taken' | 'snoozed' | 'skipped'

export const ALARM_ACTIONS: readonly AlarmAction[] = ['taken', 'snoozed', 'skipped']

/** preload가 화면에 노출하는 함수 목록 (window.api) */
export interface PillMateApi {
  /** 테스트 알람 울리기 */
  testAlarm: () => void
  /** 알람 팝업이 처음 열릴 때 표시할 항목 가져오기 */
  getAlarmItems: () => Promise<AlarmItem[]>
  /** 팝업이 열려 있는 동안 항목이 바뀌면 호출됨. 반환값은 구독 해제 함수 */
  onAlarmItems: (callback: (items: AlarmItem[]) => void) => () => void
  /** 팝업 버튼 응답 보내기 */
  respondAlarm: (action: AlarmAction) => void
}
