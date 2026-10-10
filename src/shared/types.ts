// 메인 프로세스·preload·화면이 함께 쓰는 타입
import type { SupplementSearchResult } from './publicData'

/** 알람 팝업에 표시할 복용 항목 하나 */
export interface AlarmItem {
  /** 항목 구분용 "복용일|제품id|슬롯" (테스트 알람은 "test") */
  key: string
  planDate: string
  productId: number
  slot: Slot
  productName: string
  kind: ProductKind
  dose: string
  /** 예정 시각 "HH:mm" */
  time: string
  /** 예정 일시 (ISO 8601) — "N분 지남" 계산용 */
  scheduledAt: string
  /** 설정의 '테스트 알람'으로 띄운 가짜 항목 */
  test?: boolean
}

/** 알람 팝업 화면 상태 */
export interface AlarmState {
  items: AlarmItem[]
  /** "N분 뒤 다시" 버튼의 N */
  snoozeMinutes: number
}

/** 알람 팝업 버튼: 먹었어요 / N분 뒤 다시 / 건너뛰기 */
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
  /** 알람 소리 */
  alarmSound: boolean
  /** "N분 뒤 다시"의 N */
  snoozeMinutes: number
  /** 응답이 없을 때 다시 알리는 간격(분) */
  repeatIntervalMinutes: number
  /** 첫 알림 뒤 다시 알리는 최대 횟수. 넘으면 소리 없이 팝업만 남는다 */
  repeatMaxCount: number
}

// ---------------------------------------------------------------- 영양제

/** 제품 종류: 영양제 / 병원 처방약 */
export type ProductKind = 'supplement' | 'prescription'

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
  /** 검색(공공데이터)으로 채웠으면 'public_data'. 없으면 직접 입력 */
  source?: string
}

/** 검사를 통과한 영양제 입력값 */
export interface SupplementInput {
  name: string
  manufacturer: string
  labelInstruction: string
  ingredients: Ingredient[]
  schedule: ScheduleItem[]
  /** 공공데이터 검색으로 채웠을 때만 */
  source?: 'public_data'
}

export type SaveResult = { ok: true; supplement: Supplement } | { ok: false; errors: string[] }

/** 추천 화면에서 '이대로 적용' 할 때 영양제 하나의 새 복용 시점 */
export interface ScheduleChange {
  id: number
  slots: Slot[]
}

// ---------------------------------------------------------------- 처방약

/** 처방약 식사 기준: 식전 / 식후 */
export type MealTiming = 'before' | 'after'

export const MEAL_TIMING_LABELS: Record<MealTiming, string> = { before: '식전', after: '식후' }

/** 저장된 처방약. 처방전 지시가 최우선이므로 앱이 시점을 자동으로 바꾸지 않는다 */
export interface Prescription {
  id: number
  name: string
  /** false면 사용자가 '복용 종료'함 */
  active: boolean
  createdAt: string
  mealTiming: MealTiming
  /** 식전·식후 N분 (아침·점심·저녁에만 적용) */
  mealOffsetMinutes: number
  /** 복용 시작 복용일 "yyyy-MM-dd" */
  startDate: string
  /** 처방 일수. null이면 계속 복용 */
  days: number | null
  memo: string
  /** 먹는 때 (하루 횟수 = 개수) */
  schedule: ScheduleItem[]
}

/** 입력 창 값 그대로 (숫자 칸도 문자열) */
export interface PrescriptionDraft {
  name: string
  mealTiming: string
  mealOffsetMinutes: string
  startDate: string
  /** 비우면 계속 복용 */
  days: string
  memo: string
  schedule: ScheduleDraft[]
}

/** 검사를 통과한 처방약 입력값 */
export interface PrescriptionInput {
  name: string
  mealTiming: MealTiming
  mealOffsetMinutes: number
  startDate: string
  days: number | null
  memo: string
  schedule: ScheduleItem[]
}

export type PrescriptionSaveResult = { ok: true; prescription: Prescription } | { ok: false; errors: string[] }

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
  kind: ProductKind
  slot: Slot
  dose: string
  /** 알람 시각 "HH:mm" */
  time: Hm
  /** 실제 예정 일시 (ISO 8601, +09:00). 자정 넘은 항목은 다음 날 날짜 */
  scheduledAt: string
  status: EntryStatus
  /** 먹음/건너뜀으로 표시한 시각 (ISO 8601) */
  actedAt: string | null
  /** 마지막 스누즈가 끝나는 일시 (ISO 8601). 스누즈한 적 없으면 null */
  snoozedUntil: string | null
  /** 이 복용 시점을 등록한 일시. 이보다 이른 예정 시각은 알람을 울리지 않는다 (등록 전에 이미 지난 시간) */
  addedAt: string
}

/** 오늘 화면 데이터 */
export interface TodayView {
  /** 복용일 "yyyy-MM-dd". 취침이 자정을 넘으면 새벽에도 전날일 수 있다 */
  planDate: string
  entries: DayPlanEntry[]
  /** 오늘 처방약과 영양제를 함께 먹는지 → "약사에게 확인하세요" 안내 */
  mixesPrescriptionAndSupplement: boolean
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
    /** 여러 영양제의 복용 시점을 한 번에 바꾼다 (그대로인 시점은 복용량·직접 지정 시간 유지) */
    applySchedule: (changes: ScheduleChange[]) => Promise<void>
  }
  search: {
    /** 식품안전나라 건강기능식품 검색 (제품명 필수, 제조사 선택) */
    supplements: (name: string, manufacturer: string) => Promise<SupplementSearchResult>
  }
  prescriptions: {
    list: () => Promise<Prescription[]>
    create: (draft: PrescriptionDraft) => Promise<PrescriptionSaveResult>
    update: (id: number, draft: PrescriptionDraft) => Promise<PrescriptionSaveResult>
    /** false = 복용 종료, true = 다시 복용 */
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
    /** 알람 팝업 응답 등으로 오늘 기록이 바뀌면 호출됨. 반환값은 구독 해제 함수 */
    onChanged: (callback: () => void) => () => void
  }
  /** 테스트 알람 울리기 */
  testAlarm: () => void
  alarm: {
    /**
     * 팝업이 준비되면 호출: 현재 상태를 받고, 열리기 전에 울린 알람이 있으면 ringNow가 true.
     * onState·onRing 구독을 먼저 한 뒤 부를 것.
     */
    ready: () => Promise<AlarmState & { ringNow: boolean }>
    /** 팝업이 떠 있는 동안 항목이 바뀌면 호출됨 */
    onState: (callback: (state: AlarmState) => void) => () => void
    /** 알림음을 낼 때 호출됨 */
    onRing: (callback: () => void) => () => void
    /** 팝업 버튼 응답 (팝업의 모든 항목에 적용) */
    respond: (action: AlarmAction) => void
  }
}
