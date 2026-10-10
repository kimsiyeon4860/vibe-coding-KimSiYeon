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

/** 제품 정보를 어디서 가져왔는지: 직접 입력 / 공공데이터 / 웹 검색 / 사진 */
export type ProductSource = 'manual' | 'public_data' | 'web_search' | 'photo'

/** 성분 하나 (예: 비타민 D 25 μg) */
export interface Ingredient {
  name: string
  /** 함량. 모르면 null */
  amount: number | null
  unit: string
}

/** 저장된 영양제 */
export interface Supplement {
  id: number
  name: string
  manufacturer: string
  /** 제품 라벨에 적힌 섭취 방법 (복용 순서 추천에서 규칙보다 우선) */
  labelInstruction: string
  source: ProductSource
  /** false면 '사용 중지' (복용하지 않음) */
  active: boolean
  /** ISO 8601 (UTC) */
  createdAt: string
  ingredients: Ingredient[]
}

/** 입력 창에 적힌 그대로의 성분 값 (함량도 문자열) */
export interface IngredientDraft {
  name: string
  amount: string
  unit: string
}

/** 입력 창에 적힌 그대로의 영양제 값. 저장 전에 parseSupplementDraft로 검사한다 */
export interface SupplementDraft {
  name: string
  manufacturer: string
  labelInstruction: string
  ingredients: IngredientDraft[]
}

/** 검사를 통과한 영양제 입력값 */
export interface SupplementInput {
  name: string
  manufacturer: string
  labelInstruction: string
  ingredients: Ingredient[]
}

export type SaveResult = { ok: true; supplement: Supplement } | { ok: false; errors: string[] }

/** preload가 화면에 노출하는 함수 목록 (window.api) */
export interface PillMateApi {
  supplements: {
    list: () => Promise<Supplement[]>
    create: (draft: SupplementDraft) => Promise<SaveResult>
    update: (id: number, draft: SupplementDraft) => Promise<SaveResult>
    setActive: (id: number, active: boolean) => Promise<void>
    remove: (id: number) => Promise<void>
  }
  /** 테스트 알람 울리기 */
  testAlarm: () => void
  /** 알람 팝업이 처음 열릴 때 표시할 항목 가져오기 */
  getAlarmItems: () => Promise<AlarmItem[]>
  /** 팝업이 열려 있는 동안 항목이 바뀌면 호출됨. 반환값은 구독 해제 함수 */
  onAlarmItems: (callback: (items: AlarmItem[]) => void) => () => void
  /** 팝업 버튼 응답 보내기 */
  respondAlarm: (action: AlarmAction) => void
}
