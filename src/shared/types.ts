// 메인 프로세스·preload·화면이 함께 쓰는 타입
import type { SupplementSearchResult } from './publicData'
import type { StatsView } from './stats'

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
  /** 함께 보여줄 안내 (예: 식사를 걸렀을 때) */
  note?: string
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

// ---------------------------------------------------------------- 생활 기록

/** 클릭으로 기록하는 생활 사건: 일어남 / 아침·점심·저녁 식사 / 잠자리 */
export const LIFE_EVENTS = ['wake', 'breakfast', 'lunch', 'dinner', 'bed'] as const
export type LifeEvent = (typeof LIFE_EVENTS)[number]

/** 기록 버튼 문구 */
export const LIFE_EVENT_LABELS: Record<LifeEvent, string> = {
  wake: '일어났어요',
  breakfast: '아침 먹어요',
  lunch: '점심 먹어요',
  dinner: '저녁 먹어요',
  bed: '잘게요'
}

/** 각 슬롯 알람이 따르는 생활 사건 */
export const SLOT_EVENT: Record<Slot, LifeEvent> = {
  wake: 'wake',
  breakfast: 'breakfast',
  lunch: 'lunch',
  dinner: 'dinner',
  bedtime: 'bed'
}

/** fixed = 설정한 시간에 알람 / click = 클릭으로 기록한 때를 기준으로 알람 */
export type EventMode = 'fixed' | 'click'

/** 복용일의 생활 기록 (ISO 8601). 기록하지 않은 것은 없음 */
export type DayEvents = Partial<Record<LifeEvent, string>>

/** 식사 사건 (거를 수 있는 것) */
export const MEAL_EVENTS = ['breakfast', 'lunch', 'dinner'] as const
export type MealEvent = (typeof MEAL_EVENTS)[number]

/**
 * 식사를 걸렀을 때 항목 처리
 * - carried: 영양제를 다음 식사 알람으로 옮김
 * - dropped: 옮길 다음 식사가 없어 오늘은 알리지 않음 (통계에서도 뺌)
 * - prescription: 처방약은 옮기지 않고 바로 알리며 '약사 지시대로' 안내
 */
export type MealSkipHandling = 'carried' | 'dropped' | 'prescription'

/** 기상·식사 확인 창 정보 */
export interface PromptInfo {
  kind: 'wake' | 'meal'
  event: LifeEvent
  planDate: string
  /** 지금 시각 "HH:mm" */
  now: Hm
  /** 알림음을 낼지 (식사 확인은 알람 소리 설정을 따른다) */
  sound: boolean
}

/** now = 방금 함, at = 그 시각에 함, skip = 안 먹음(식사만), later = 나중에 */
export type PromptAnswer = { action: 'now' } | { action: 'at'; time: Hm } | { action: 'skip' } | { action: 'later' }

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
  /** Windows 시작 시 자동 실행 (설치한 앱에서만 적용) */
  autoLaunch: boolean
  /** 사건별로 고정 시간을 쓸지, 클릭 기록을 기준으로 할지 */
  eventModes: Record<LifeEvent, EventMode>
  /** 클릭 기록 모드에서 기록이 없으면 평소 시간 + N분에 그냥 알린다 */
  eventFallbackMinutes: number
  /** 평소 먹는 식사. false인 식사는 기록이 없으면 거른 것으로 보고 영양제를 다음 식사로 옮긴다 */
  usualMeals: Record<MealEvent, boolean>
}

/** 설정 탭의 '검색 API 키' 상태 */
export interface EnvInfo {
  /** 식품안전나라 (건강기능식품) */
  hasSearchKey: boolean
  /** 견본 키(sample, 최대 5건)를 쓰는 중 */
  isSampleKey: boolean
  /** 공공데이터포털 (일반의약품) */
  hasDrugKey: boolean
  /** 앱이 읽는 .env 파일 경로 */
  envPath: string
  /** 설치한 앱인지 (자동 실행은 설치한 앱에서만) */
  isPackaged: boolean
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
  /** 클릭 기록을 기다리는 중이면 그 사건 (기록이 없으면 scheduledAt = 평소 시간 + 대기 시간) */
  waitingFor: LifeEvent | null
  /** 이 항목의 식사를 걸렀을 때 처리 (거르지 않았으면 null) */
  mealSkip: MealSkipHandling | null
  /** mealSkip이 carried일 때 옮겨 간 슬롯 */
  carriedTo: Slot | null
  /** 거른 이유가 '평소 안 먹는 식사' 설정인지 (그날 '안 먹어요'를 누른 것이 아니라) */
  mealSkipByHabit: boolean
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
  /** 그 복용일의 생활 기록 */
  events: DayEvents
  /** 그 복용일에 거른 식사 (거름을 누른 시각) */
  skips: DayEvents
  /** '클릭 기록' 모드인 사건 (오늘 탭에 기록 버튼으로 보여줄 것) */
  clickEvents: LifeEvent[]
}

// ---------------------------------------------------------------- window.api

/** 웹판 브라우저 알림 권한 ('unsupported' = 브라우저가 알림을 지원하지 않음) */
export type NotificationStatus = 'default' | 'granted' | 'denied' | 'unsupported'

/** 웹판에서만 쓰는 기능 (데스크톱판에는 없음) */
export interface WebOnlyApi {
  /** 검색 API 키 (이 브라우저에만 저장) */
  getKeys: () => Promise<{ foodSafety: string; dataGoKr: string }>
  setKeys: (keys: { foodSafety: string; dataGoKr: string }) => Promise<void>
  /** 데이터 백업: DB 파일 바이트 */
  exportBackup: () => Promise<Uint8Array>
  /** 백업 불러오기: 성공하면 페이지를 다시 연다 */
  importBackup: (bytes: Uint8Array) => Promise<{ ok: true } | { ok: false; error: string }>
  notificationStatus: () => NotificationStatus
  /** 알림 권한을 묻고, 알림음도 한 번 재생해 소리를 켠다 (사용자가 누른 버튼에서 불러야 한다) */
  enableNotifications: () => Promise<NotificationStatus>
}

/** preload(데스크톱) 또는 src/web(웹)가 화면에 노출하는 함수 목록 (window.api) */
export interface PillMateApi {
  /** 실행 환경 */
  platform: 'desktop' | 'web'
  /** 웹판에서만 */
  web?: WebOnlyApi
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
    /** 건강기능식품(식품안전나라)·일반의약품(공공데이터포털) 검색 (제품명 필수, 제조사는 건강기능식품에만) */
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
    /** 생활 기록. time("HH:mm")이 없으면 지금 */
    recordEvent: (planDate: string, event: LifeEvent, time?: Hm) => Promise<TodayView>
    /** 기록·거름 모두 지운다 */
    clearEvent: (planDate: string, event: LifeEvent) => Promise<TodayView>
    /** 식사를 거름 */
    skipEvent: (planDate: string, event: MealEvent) => Promise<TodayView>
  }
  /** 기상 기록 창(그날 처음 PC를 쓸 때) · 식사 확인 창(기록이 없을 때 "드셨어요?") */
  prompt: {
    info: () => Promise<PromptInfo>
    respond: (answer: PromptAnswer) => void
  }
  stats: {
    /** 최근 7일·30일 또는 전체(처음 등록·기록한 날부터, 최대 365일) 복용 통계 */
    get: (days: 7 | 30 | 'all') => Promise<StatsView>
  }
  app: {
    envInfo: () => Promise<EnvInfo>
    /** .env가 있어야 하는 폴더를 파일 탐색기로 연다 */
    openEnvFolder: () => Promise<void>
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
