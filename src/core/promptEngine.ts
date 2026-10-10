// 생활 기록 확인 판단 엔진 (데스크톱·웹 공통):
// - 식사: 클릭 기록 모드에서 평소 식사 + 대기 시간이 지나도 기록이 없으면 "○○ 드셨어요?" (사용 중이 아니어도)
// - 기상: 그날 처음 사용 중일 때 한 번 "오늘 일어난 시간을 기록할까요?"
// 창을 띄우는 방법은 각 플랫폼이 맡는다.
import { pendingMealQuestions } from '../shared/alarm'
import { clockOf, isWakePromptTime, parseHm, planDateFor } from '../shared/schedule'
import { MEAL_EVENTS, type LifeEvent, type MealEvent, type PromptAnswer, type PromptInfo } from '../shared/types'
import { listDayEvents, listDaySkips } from './db/lifeEvents'
import { getSettings } from './db/settings'
import type { SqlDatabase } from './db/sql'
import { getDayPlan, recordLifeEvent, skipMeal } from './today'

/** 식사 확인에서 '나중에'를 누르면 다시 묻기까지 */
const MEAL_LATER_MS = 30 * 60_000

export interface PromptRequest {
  kind: 'wake' | 'meal'
  event: LifeEvent
  planDate: string
}

export interface PromptEngine {
  /** 지금 물어볼 것 (없으면 null). 기상은 돌려주는 순간 '그날 물어봄'으로 표시된다 */
  next: (now: Date, userActive: boolean) => PromptRequest | null
  /** 창에 보여줄 정보 */
  info: (request: PromptRequest, now?: Date) => PromptInfo
  /** 답을 기록한다. 기록이나 거름이 바뀌었으면 true */
  answer: (request: PromptRequest, answer: PromptAnswer, now?: Date) => boolean
}

export function createPromptEngine(db: SqlDatabase): PromptEngine {
  /** 기상을 이미 물어본 복용일 (나중에를 눌렀어도 그날은 다시 묻지 않는다) */
  let wakeAskedFor: string | null = null
  /** 식사 확인 '나중에': "복용일|식사" → 다시 물을 시각(ms) */
  const mealLater = new Map<string, number>()

  return {
    next: (now, userActive) => {
      const settings = getSettings(db)
      const planDate = planDateFor(now, settings)
      const events = listDayEvents(db, planDate)

      const meals = pendingMealQuestions(
        getDayPlan(db, planDate),
        events,
        listDaySkips(db, planDate),
        settings,
        now
      ).filter((meal) => (mealLater.get(`${planDate}|${meal}`) ?? 0) <= now.getTime())
      if (meals.length > 0) return { kind: 'meal', event: meals[0], planDate }

      if (settings.eventModes.wake !== 'click' || wakeAskedFor === planDate || events.wake) return null
      if (!isWakePromptTime(now, settings) || !userActive) return null
      wakeAskedFor = planDate
      return { kind: 'wake', event: 'wake', planDate }
    },

    info: (request, now = new Date()) => ({
      ...request,
      now: clockOf(now.toISOString()),
      sound: request.kind === 'meal' && getSettings(db).alarmSound
    }),

    answer: (request, answer, now = new Date()) => {
      const { planDate, event } = request
      if (answer?.action === 'now') recordLifeEvent(db, planDate, event, undefined, now)
      else if (answer?.action === 'at' && parseHm(answer.time) !== null) recordLifeEvent(db, planDate, event, answer.time)
      else if (answer?.action === 'skip' && MEAL_EVENTS.includes(event as MealEvent)) {
        skipMeal(db, planDate, event as MealEvent, now)
      } else {
        if (request.kind === 'meal') mealLater.set(`${planDate}|${event}`, now.getTime() + MEAL_LATER_MS)
        return false
      }
      return true
    }
  }
}
