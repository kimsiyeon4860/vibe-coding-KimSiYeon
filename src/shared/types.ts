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

/** 검사 결과: 통과하면 정리된 값, 아니면 사용자에게 보여줄 오류 문구 목록 */
export type ParseResult<T> = { ok: true; value: T } | { ok: false; errors: string[] }

// ---------------------------------------------------------------- 복용 슬롯

/** 하루를 나누는 기본 복용 시점 (시간순) */
export const SLOTS = ['wake', 'breakfast', 'lunch', 'dinner', 'bedtime'] as const
export type Slot = (typeof SLOTS)[number]

export const SLOT_LABELS: Record<Slot, string> = {
  wake: '기상 직후 공복',
  breakfast: '아침 식후',
  lunch: '점심 식후',
  dinner: '저녁 식후',
  bedtime: '취침 전'
}

/** 시간 문자열 "HH:mm" (24시간) */
export type Hm = string

/** 생활 시간 설정. 슬롯 알람 시간은 여기서 계산된다 */
export interface Settings {
  wakeTime: Hm
  breakfastTime: Hm
  lunchTime: Hm
  dinnerTime: Hm
  bedTime: Hm
  /** 식후 슬롯 = 식사 시간 + N분 */
  afterMealMinutes: number
  /** 취침 전 슬롯 = 취침 시간 − N분 */
  beforeBedMinutes: number
  /** 계산 대신 직접 정한 슬롯 시간 */
  slotOverrides: Partial<Record<Slot, Hm>>
}

// ---------------------------------------------------------------- 영양제

/** 제품 정보를 어디서 가져왔는지: 직접 입력 / 공공데이터 / 웹 검색 / 사진 */
export type ProductSource = 'manual' | 'public_data' | 'web_search' | 'photo'

/** 성분 하나 (예: 비타민 D 25 μg) */
export interface Ingredient {
  name: string
  /** 함량. 모르면 null */
  amount: number | null
  unit: string
}

/** 영양제를 언제 먹는지: 슬롯 하나당 한 항목 */
export interface ScheduleItem {
  slot: Slot
  /** 이 영양제만 다른 시간에 먹을 때. 없으면 슬롯 시간 */
  customTime: Hm | null
  /** 복용량 메모 (예: "1캡슐") */
  dose: string
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
  /** 슬롯 순서로 정렬 */
  schedule: ScheduleItem[]
}

/** 입력 창에 적힌 그대로의 성분 값 (함량도 문자열) */
export interface IngredientDraft {
  name: string
  amount: string
  unit: string
}

/** 입력 창에 적힌 그대로의 복용 시점 값 (customTime은 비어 있으면 '') */
export interface ScheduleDraft {
  slot: string
  customTime: string
  dose: string
}

/** 입력 창에 적힌 그대로의 영양제 값. 저장 전에 parseSupplementDraft로 검사한다 */
export interface SupplementDraft {
  name: string
  manufacturer: string
  labelInstruction: string
  ingredients: IngredientDraft[]
  schedule: ScheduleDraft[]
}

/** 검사를 통과한 영양제 입력값 */
export interface SupplementInput {
  name: string
  manufacturer: string
  labelInstruction: string
  ingredients: Ingredient[]
  schedule: ScheduleItem[]
}

export type SaveResult = { ok: true; supplement: Supplement } | { ok: false; errors: string[] }

// ---------------------------------------------------------------- 오늘 복용

/** 오늘 화면에서 직접 누르는 응답 (snoozed는 알람 팝업에서만) */
export type CheckAction = 'taken' | 'skipped'

/** 복용 기록 하나 (intake_logs 행) */
export interface IntakeLog {
  productId: number
  slot: Slot
  action: 'taken' | 'snoozed' | 'skipped' | 'missed'
  /** ISO 8601 */
  actedAt: string
}

export type EntryStatus = 'pending' | CheckAction

/** 하루 복용 계획의 한 줄 (영양제 × 슬롯) */
export interface DayPlanEntry {
  productId: number
  productName: string
  slot: Slot
  dose: string
  /** 알람 시각 "HH:mm" */
  time: Hm
  /** 실제 예정 일시 (ISO 8601, +09:00). 자정 넘은 항목은 다음 날 날짜 */
  scheduledAt: string
  status: EntryStatus
  /** 먹음/건너뜀으로 표시한 시각 (ISO 8601) */
  actedAt: string | null
}

/** 오늘 화면 데이터 */
export interface TodayView {
  /** 복용일 "yyyy-MM-dd". 취침이 자정을 넘으면 새벽에도 전날일 수 있다 */
  planDate: string
  entries: DayPlanEntry[]
}

// ---------------------------------------------------------------- window.api

/** preload가 화면에 노출하는 함수 목록 (window.api) */
export interface PillMateApi {
  supplements: {
    list: () => Promise<Supplement[]>
    create: (draft: SupplementDraft) => Promise<SaveResult>
    update: (id: number, draft: SupplementDraft) => Promise<SaveResult>
    setActive: (id: number, active: boolean) => Promise<void>
    remove: (id: number) => Promise<void>
  }
  settings: {
    get: () => Promise<Settings>
    save: (settings: Settings) => Promise<ParseResult<Settings>>
  }
  today: {
    get: () => Promise<TodayView>
    /** planDate는 화면에 표시 중인 복용일 (자정 직후 눌러도 엉뚱한 날에 기록되지 않도록) */
    check: (planDate: string, productId: number, slot: Slot, action: CheckAction) => Promise<TodayView>
    undo: (planDate: string, productId: number, slot: Slot) => Promise<TodayView>
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
