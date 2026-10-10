// 화면이 부르는 기능 (데스크톱·웹 공통). 데스크톱은 IPC로(src/main/ipc.ts), 웹은 바로(src/web/webApi.ts) 연결한다.
// 화면에서 오는 값은 믿지 않고 여기서 다시 검사한다.
import { parsePrescriptionDraft } from '../shared/prescription'
import { mergeSearchResults, type SupplementSearchResult } from '../shared/publicData'
import { isPlanDate, parseHm, parseSettings } from '../shared/schedule'
import { parseSupplementDraft } from '../shared/supplementInput'
import {
  LIFE_EVENTS,
  MEAL_EVENTS,
  SLOTS,
  type CheckAction,
  type LifeEvent,
  type MealEvent,
  type ParseResult,
  type PrescriptionSaveResult,
  type SaveResult,
  type ScheduleChange,
  type Settings,
  type Slot
} from '../shared/types'
import {
  createPrescription,
  deletePrescription,
  listPrescriptions,
  setPrescriptionActive,
  updatePrescription
} from './db/prescriptions'
import { getSettings, saveSettings } from './db/settings'
import type { SqlDatabase } from './db/sql'
import {
  applyScheduleChanges,
  createSupplement,
  deleteSupplement,
  listSupplements,
  setSupplementActive,
  updateSupplement
} from './db/supplements'
import { searchOtcDrugs } from './services/drugInfo'
import { searchSupplements } from './services/foodSafety'
import {
  clearLifeEvent,
  getStatsView,
  getTodayView,
  recordCheck,
  recordLifeEvent,
  skipMeal,
  undoCheck
} from './today'

export interface CoreHooks {
  /** 영양제·처방약·설정·기록이 바뀌었을 때 (알람 다시 확인) */
  onChanged: () => void
  /** 설정을 저장했을 때 (데스크톱: 자동 실행 반영) */
  onSettingsSaved?: (settings: Settings) => void
  /** 검색 API 키 (데스크톱: .env, 웹: 브라우저 설정) */
  searchKeys: () => { foodSafety?: string; dataGoKr?: string }
}

export function createCoreApi(db: SqlDatabase, hooks: CoreHooks) {
  /** 바꾼 뒤 알리고 결과를 돌려준다 */
  const changed = <T>(result: T): T => {
    hooks.onChanged()
    return result
  }

  return {
    supplements: {
      list: () => listSupplements(db),
      create: (draft: unknown): SaveResult => {
        const parsed = parseSupplementDraft(draft)
        if (!parsed.ok) return parsed
        return changed({ ok: true, supplement: createSupplement(db, parsed.value, parsed.value.source ?? 'manual') })
      },
      update: (id: unknown, draft: unknown): SaveResult => {
        const parsed = parseSupplementDraft(draft)
        if (!parsed.ok) return parsed
        const supplement = isId(id) ? updateSupplement(db, id, parsed.value) : null
        if (!supplement) return { ok: false, errors: ['수정할 영양제를 찾을 수 없습니다'] }
        return changed({ ok: true, supplement })
      },
      setActive: (id: unknown, active: unknown): void => {
        if (isId(id) && typeof active === 'boolean') changed(setSupplementActive(db, id, active))
      },
      remove: (id: unknown): void => {
        if (isId(id)) changed(deleteSupplement(db, id))
      },
      applySchedule: (changes: unknown): void => {
        if (Array.isArray(changes) && changes.every(isScheduleChange)) changed(applyScheduleChanges(db, changes))
      }
    },

    prescriptions: {
      list: () => listPrescriptions(db),
      create: (draft: unknown): PrescriptionSaveResult => {
        const parsed = parsePrescriptionDraft(draft)
        if (!parsed.ok) return parsed
        return changed({ ok: true, prescription: createPrescription(db, parsed.value) })
      },
      update: (id: unknown, draft: unknown): PrescriptionSaveResult => {
        const parsed = parsePrescriptionDraft(draft)
        if (!parsed.ok) return parsed
        const prescription = isId(id) ? updatePrescription(db, id, parsed.value) : null
        if (!prescription) return { ok: false, errors: ['수정할 처방약을 찾을 수 없습니다'] }
        return changed({ ok: true, prescription })
      },
      setActive: (id: unknown, active: unknown): void => {
        if (isId(id) && typeof active === 'boolean') changed(setPrescriptionActive(db, id, active))
      },
      remove: (id: unknown): void => {
        if (isId(id)) changed(deletePrescription(db, id))
      }
    },

    settings: {
      get: () => getSettings(db),
      save: (raw: unknown): ParseResult<Settings> => {
        const parsed = parseSettings(raw)
        if (parsed.ok) {
          saveSettings(db, parsed.value)
          hooks.onSettingsSaved?.(parsed.value)
          hooks.onChanged()
        }
        return parsed
      }
    },

    today: {
      get: () => getTodayView(db),
      check: (planDate: unknown, productId: unknown, slot: unknown, action: unknown) => {
        if (isPlanDate(planDate) && isId(productId) && isSlot(slot) && isCheckAction(action)) {
          changed(recordCheck(db, planDate, productId, slot, action))
        }
        return getTodayView(db)
      },
      undo: (planDate: unknown, productId: unknown, slot: unknown) => {
        if (isPlanDate(planDate) && isId(productId) && isSlot(slot)) changed(undoCheck(db, planDate, productId, slot))
        return getTodayView(db)
      },
      recordEvent: (planDate: unknown, event: unknown, time?: unknown) => {
        const validTime = time === undefined || time === null || parseHm(time) !== null
        if (isPlanDate(planDate) && isLifeEvent(event) && validTime) {
          changed(recordLifeEvent(db, planDate, event, typeof time === 'string' ? time : undefined))
        }
        return getTodayView(db)
      },
      clearEvent: (planDate: unknown, event: unknown) => {
        if (isPlanDate(planDate) && isLifeEvent(event)) changed(clearLifeEvent(db, planDate, event))
        return getTodayView(db)
      },
      skipEvent: (planDate: unknown, meal: unknown) => {
        if (isPlanDate(planDate) && MEAL_EVENTS.includes(meal as MealEvent)) {
          changed(skipMeal(db, planDate, meal as MealEvent))
        }
        return getTodayView(db)
      }
    },

    stats: {
      get: (days: unknown) => getStatsView(db, days === 30 ? 30 : 7)
    },

    search: {
      /** 건강기능식품(식품안전나라)·일반의약품(공공데이터포털)을 동시에 찾는다 */
      supplements: async (name: unknown, manufacturer: unknown): Promise<SupplementSearchResult> => {
        const query = typeof name === 'string' ? name : ''
        if (!query.trim()) return { ok: false, error: '제품명을 입력해 주세요' }
        const maker = typeof manufacturer === 'string' ? manufacturer : ''
        const keys = hooks.searchKeys()
        const [healthFood, otcDrug] = await Promise.all([
          searchSupplements(query, maker, { apiKey: keys.foodSafety }),
          // 의약품 정보의 업체명은 판매사라 제조사 칸과 맞지 않을 수 있어 제품명으로만 찾는다
          searchOtcDrugs(query, { apiKey: keys.dataGoKr })
        ])
        return mergeSearchResults(healthFood, otcDrug)
      }
    }
  }
}

export type CoreApi = ReturnType<typeof createCoreApi>

function isId(value: unknown): value is number {
  return Number.isInteger(value) && (value as number) > 0
}

function isSlot(value: unknown): value is Slot {
  return SLOTS.includes(value as Slot)
}

function isCheckAction(value: unknown): value is CheckAction {
  return value === 'taken' || value === 'skipped'
}

function isLifeEvent(value: unknown): value is LifeEvent {
  return LIFE_EVENTS.includes(value as LifeEvent)
}

function isScheduleChange(value: unknown): value is ScheduleChange {
  if (typeof value !== 'object' || value === null) return false
  const { id, slots } = value as Record<string, unknown>
  return (
    isId(id) && Array.isArray(slots) && slots.every((s) => SLOTS.includes(s as Slot)) && new Set(slots).size === slots.length
  )
}
