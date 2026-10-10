import { describe, expect, it } from 'vitest'
import { mealSkipNote, pendingMealQuestions } from '../src/shared/alarm'
import { recommend } from '../src/shared/recommend'
import { buildDayPlan, DEFAULT_SETTINGS, parseSettings, type ScheduleSource } from '../src/shared/schedule'
import type { Settings, Supplement } from '../src/shared/types'

const DATE = '2026-10-10'
const at = (hm: string) => `${DATE}T${hm}:00.000+09:00`

/** 아침을 평소 안 먹는 사람 */
const noBreakfast: Settings = { ...DEFAULT_SETTINGS, usualMeals: { breakfast: false, lunch: true, dinner: true } }

const source = (overrides: Partial<ScheduleSource> = {}): ScheduleSource => ({
  productId: 1,
  productName: '비타민D',
  kind: 'supplement',
  active: true,
  slot: 'breakfast',
  customTime: null,
  dose: '',
  mealOffset: null,
  startDate: null,
  endDate: null,
  addedAt: '1970-01-01T00:00:00.000Z',
  ...overrides
})

describe('평소 안 먹는 식사의 알람', () => {
  it('영양제는 기록이 없으면 다음 식사로 옮긴다 (이유: 평소 안 먹음)', () => {
    const [e] = buildDayPlan(DATE, noBreakfast, [source()], [])
    expect(e).toMatchObject({ mealSkip: 'carried', carriedTo: 'lunch', mealSkipByHabit: true, waitingFor: 'lunch' })
    expect(mealSkipNote(e)).toBe('평소 아침을 드시지 않아 점심 식후에 함께 알려 드려요.')
  })

  it('그날 아침을 기록하면 원래대로 아침 식후에', () => {
    const [e] = buildDayPlan(DATE, noBreakfast, [source()], [], { breakfast: at('10:00') })
    expect(e).toMatchObject({ mealSkip: null, time: '10:15' })
  })

  it('처방약은 평소 안 먹는 식사여도 처방대로 둔다', () => {
    const [e] = buildDayPlan(DATE, noBreakfast, [source({ kind: 'prescription', mealOffset: 30 })], [])
    expect(e).toMatchObject({ mealSkip: null, waitingFor: 'breakfast' })
  })

  it('다음 식사도 평소 안 먹으면 그다음으로, 없으면 오늘은 알리지 않는다', () => {
    const onlyDinner = { ...DEFAULT_SETTINGS, usualMeals: { breakfast: false, lunch: false, dinner: true } }
    expect(buildDayPlan(DATE, onlyDinner, [source()], [])[0]).toMatchObject({ carriedTo: 'dinner' })
    const noDinner = { ...DEFAULT_SETTINGS, usualMeals: { breakfast: true, lunch: true, dinner: false } }
    expect(buildDayPlan(DATE, noDinner, [source({ slot: 'dinner' })], [])[0]).toMatchObject({
      mealSkip: 'dropped',
      mealSkipByHabit: true
    })
  })

  it('아침은 묻지 않고, 옮겨 간 점심을 묻는다', () => {
    const entries = buildDayPlan(DATE, noBreakfast, [source()], [])
    expect(pendingMealQuestions(entries, {}, {}, noBreakfast, new Date(at('10:00')))).toEqual([])
    expect(pendingMealQuestions(entries, {}, {}, noBreakfast, new Date(at('13:45')))).toEqual(['lunch'])
  })
})

describe('추천이 평소 안 먹는 식사를 피한다', () => {
  let id = 1
  const supp = (name: string, ingredients: string[], labelInstruction = ''): Supplement => ({
    id: id++,
    name,
    manufacturer: '',
    labelInstruction,
    source: 'manual',
    active: true,
    createdAt: '',
    ingredients: ingredients.map((n) => ({ name: n, amount: null, unit: '' })),
    schedule: []
  })

  it('지용성 비타민: 아침 대신 다음 후보(저녁) + 이유', () => {
    const [rec] = recommend([supp('비타민D', ['비타민 D'])], noBreakfast)
    expect(rec.slots).toEqual(['dinner'])
    expect(rec.reasons.at(-1)).toBe('평소 아침을 드시지 않아 저녁 식후로 추천했어요')
  })

  it('B군: 아침 대신 점심', () => {
    expect(recommend([supp('비타민B', ['비타민 B12'])], noBreakfast)[0].slots).toEqual(['lunch'])
  })

  it('라벨이 아침을 정했으면 그대로 두되 안내를 붙인다', () => {
    const [rec] = recommend([supp('X', [], '아침 식후 1정')], noBreakfast)
    expect(rec.slots).toEqual(['breakfast'])
    expect(rec.reasons[1]).toContain('평소 아침을 드시지 않아요')
  })

  it("라벨이 '식후'만 말하고 규칙이 없으면 평소 먹는 첫 식사", () => {
    expect(recommend([supp('X', [], '1일 1회 식후')], noBreakfast)[0].slots).toEqual(['lunch'])
  })

  it('세 끼 다 먹으면 예전과 같다', () => {
    expect(recommend([supp('비타민D', ['비타민 D'])], DEFAULT_SETTINGS)[0].slots).toEqual(['breakfast'])
  })
})

describe('설정', () => {
  it('기본은 세 끼 모두', () => {
    expect(DEFAULT_SETTINGS.usualMeals).toEqual({ breakfast: true, lunch: true, dinner: true })
  })

  it('형식이 틀리면 오류', () => {
    expect(parseSettings({ ...DEFAULT_SETTINGS, usualMeals: { breakfast: 'no' } })).toMatchObject({
      ok: false,
      errors: ['평소 먹는 식사 설정이 올바르지 않습니다']
    })
  })
})
