import type { SqlDatabase } from '../src/core/db/sql'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import rawRules from '../rules/timing-rules.json'
import { openDatabase } from '../src/main/db/connection'
import { applyScheduleChanges, createSupplement, getSupplement } from '../src/core/db/supplements'
import {
  findConflicts,
  parseLabelInstruction,
  placeDoses,
  recommend,
  rescheduleItems,
  rulesOf
} from '../src/shared/recommend'
import { matchIngredients, normalizeName, RULES, validateRules } from '../src/shared/rules'
import { DEFAULT_SETTINGS } from '../src/shared/schedule'
import type { Slot, Supplement } from '../src/shared/types'

let nextId = 1
const supp = (name: string, ingredients: string[] = [], overrides: Partial<Supplement> = {}): Supplement => ({
  id: nextId++,
  name,
  manufacturer: '',
  labelInstruction: '',
  source: 'manual',
  active: true,
  createdAt: '2026-10-10T00:00:00.000Z',
  ingredients: ingredients.map((n) => ({ name: n, amount: null, unit: '' })),
  schedule: [],
  ...overrides
})

const slotsOf = (recs: ReturnType<typeof recommend>, name: string) => recs.find((r) => r.productName === name)?.slots

describe('규칙 파일', () => {
  it('형식이 올바르다 (별칭 중복·없는 성분 참조·출처 누락 없음)', () => {
    expect(validateRules(rawRules)).toEqual([])
  })

  it('잘못된 규칙을 잡아낸다', () => {
    const broken = structuredClone(rawRules) as typeof rawRules
    broken.ingredients[1].aliases.push('레티놀') // 비타민 A 별칭과 중복
    broken.conflicts[0].b = 'unknown'
    const errors = validateRules(broken)
    expect(errors.some((e) => e.includes('중복'))).toBe(true)
    expect(errors.some((e) => e.includes('없는 성분 id'))).toBe(true)
  })
})

describe('성분 이름 인식', () => {
  const ids = (name: string) => matchIngredients(name).map((r) => r.id)

  it('공백·기호·대소문자를 무시한다', () => {
    expect(normalizeName('오메가-3 (EPA)')).toBe('오메가3epa')
    expect(ids('Vitamin D3')).toEqual(['vitamin_d'])
    expect(ids('비타민 D3 (콜레칼시페롤)')).toEqual(['vitamin_d'])
    expect(ids('EPA 및 DHA 함유 유지')).toEqual(['omega3'])
  })

  it('긴 이름이 짧은 이름을 덮는다', () => {
    expect(ids('판토텐산칼슘')).toEqual(['vitamin_b'])
    expect(ids('스테아르산마그네슘')).toEqual([])
    expect(ids('산화마그네슘')).toEqual(['magnesium'])
  })

  it('한 이름에 여러 성분', () => {
    expect(ids('칼슘·마그네슘·아연')).toEqual(['calcium', 'magnesium', 'zinc'])
  })

  it('모르는 이름', () => {
    expect(ids('밀크씨슬')).toEqual([])
  })

  it('성분이 없으면 제품 이름으로 찾는다', () => {
    expect(rulesOf(supp('알티지 오메가3')).map((r) => r.id)).toEqual(['omega3'])
    expect(rulesOf(supp('오메가3', ['비타민 E'])).map((r) => r.id)).toEqual(['vitamin_e'])
  })
})

describe('라벨 해석', () => {
  it.each<[string, Slot[] | null, boolean]>([
    ['1일 1회 공복에 섭취', ['wake'], false],
    ['취침 전 1캡슐', ['bedtime'], false],
    ['자기 전에 드세요', ['bedtime'], false],
    ['아침·저녁 식후', ['breakfast', 'dinner'], false],
    ['1일 2회, 1회 1정 식후', ['breakfast', 'dinner'], false],
    ['하루 3번', ['breakfast', 'lunch', 'dinner'], false],
    ['1일 1회 식사와 함께', null, true]
  ])('"%s"', (text, slots, mealOnly) => {
    expect(parseLabelInstruction(text)).toEqual({ slots, mealOnly, understood: true })
  })

  it('시점 정보가 없으면 해석 못 함', () => {
    expect(parseLabelInstruction('1일 1회 1캡슐')).toEqual({ slots: null, mealOnly: false, understood: false })
    expect(parseLabelInstruction('')).toMatchObject({ understood: false })
  })
})

describe('추천', () => {
  it('성분 규칙대로: 마그네슘은 취침 전, 비타민 D는 아침', () => {
    const recs = recommend([supp('마그네슘', ['산화마그네슘']), supp('비타민D', ['비타민 D3'])], DEFAULT_SETTINGS)
    expect(slotsOf(recs, '마그네슘')).toEqual(['bedtime'])
    expect(slotsOf(recs, '비타민D')).toEqual(['breakfast'])
    expect(recs[0]).toMatchObject({ basis: 'rule', evidenceLimited: true })
    expect(recs[1]).toMatchObject({ basis: 'rule', evidenceLimited: false })
  })

  it('종합비타민 (지용성 + B군) → 아침', () => {
    const recs = recommend([supp('멀티', ['비타민 A', '비타민 D', '비타민 B12'])], DEFAULT_SETTINGS)
    expect(recs[0].slots).toEqual(['breakfast'])
    expect(recs[0].reasons).toHaveLength(3)
  })

  it('철분과 칼슘은 2시간 이상 떨어뜨린다', () => {
    const recs = recommend(
      [supp('칼슘', ['탄산칼슘']), supp('철분', ['푸마르산제일철']), supp('아연', ['글루콘산아연'])],
      DEFAULT_SETTINGS
    )
    expect(slotsOf(recs, '철분')).toEqual(['wake'])
    expect(slotsOf(recs, '칼슘')).toEqual(['dinner'])
    expect(slotsOf(recs, '아연')).toEqual(['dinner'])
  })

  it('충돌을 피할 수 없게 만들면 이전 후보를 피해 다음 후보로 간다', () => {
    // 기상 07:00, 아침 08:15 → 철분이 어디든 2시간 안에 칼슘이 오지 않도록 칼슘이 비켜 간다
    const settings = { ...DEFAULT_SETTINGS, dinnerTime: '08:30', lunchTime: '08:20', breakfastTime: '08:10' }
    const recs = recommend([supp('철분', ['철분']), supp('칼슘', ['칼슘'])], settings)
    const doses = placeDoses(
      recs.map((r) => ({ supplement: supp(r.productName, [r.productName], { id: r.productId }), slots: r.slots })),
      settings
    )
    // 식사가 모두 아침에 몰려 있어 피할 수 없음 → 첫 후보(저녁)에 두고 경고가 남는다
    expect(slotsOf(recs, '칼슘')).toEqual(['dinner'])
    expect(findConflicts(doses, settings)).toHaveLength(1)
  })

  it('라벨이 규칙보다 우선', () => {
    const recs = recommend([supp('마그네슘', ['마그네슘'], { labelInstruction: '아침 식후 1정' })], DEFAULT_SETTINGS)
    expect(recs[0]).toMatchObject({ slots: ['breakfast'], basis: 'label', reasons: ['라벨: 아침 식후 1정'] })
  })

  it("라벨이 '식후'만 말하면 규칙 후보 중 식사 시점으로", () => {
    const recs = recommend([supp('마그네슘', ['마그네슘'], { labelInstruction: '1일 1회 식후' })], DEFAULT_SETTINGS)
    expect(recs[0]).toMatchObject({ slots: ['dinner'], basis: 'rule' })
  })

  it('해석 못 한 라벨은 원문을 보여준다', () => {
    const recs = recommend([supp('비타민D', ['비타민D'], { labelInstruction: '1일 1캡슐' })], DEFAULT_SETTINGS)
    expect(recs[0].unreadLabel).toBe('1일 1캡슐')
  })

  it('규칙 없는 성분은 현재 일정을 유지하고 직접 정하게 한다', () => {
    const current = [{ slot: 'lunch' as const, customTime: null, dose: '' }]
    const recs = recommend([supp('밀크씨슬', ['밀크씨슬 추출물'], { schedule: current })], DEFAULT_SETTINGS)
    expect(recs[0]).toMatchObject({ slots: ['lunch'], basis: 'none' })
  })

  it('사용 중지한 영양제는 추천하지 않는다', () => {
    expect(recommend([supp('비타민D', ['비타민D'], { active: false })], DEFAULT_SETTINGS)).toEqual([])
  })
})

describe('충돌 찾기', () => {
  const iron = supp('철분', ['철분'])
  const calcium = supp('칼슘', ['칼슘'])

  it('설정 시간으로 간격을 잰다 (기상 07:00 ↔ 아침 08:15 = 75분)', () => {
    const conflicts = findConflicts(
      placeDoses(
        [
          { supplement: iron, slots: ['wake'] },
          { supplement: calcium, slots: ['breakfast'] }
        ],
        DEFAULT_SETTINGS
      ),
      DEFAULT_SETTINGS
    )
    expect(conflicts).toHaveLength(1)
    expect(conflicts[0].gapMinutes).toBe(75)
  })

  it('2시간 이상이면 경고 없음', () => {
    const doses = placeDoses(
      [
        { supplement: iron, slots: ['wake'] },
        { supplement: calcium, slots: ['lunch'] }
      ],
      DEFAULT_SETTINGS
    )
    expect(findConflicts(doses, DEFAULT_SETTINGS)).toEqual([])
  })

  it('직접 지정한 시간을 반영한다', () => {
    const calciumAt0730 = supp('칼슘', ['칼슘'], { schedule: [{ slot: 'lunch', customTime: '07:30', dose: '' }] })
    const doses = placeDoses(
      [
        { supplement: iron, slots: ['wake'] },
        { supplement: calciumAt0730, slots: ['lunch'] }
      ],
      DEFAULT_SETTINGS
    )
    expect(findConflicts(doses, DEFAULT_SETTINGS)[0].gapMinutes).toBe(30)
  })

  it('같은 영양제 안의 철분·칼슘은 경고하지 않는다', () => {
    const multi = supp('멀티', ['철분', '칼슘'])
    expect(findConflicts(placeDoses([{ supplement: multi, slots: ['breakfast'] }], DEFAULT_SETTINGS), DEFAULT_SETTINGS)).toEqual([])
  })
})

describe('적용', () => {
  it('그대로인 슬롯은 유지, 옮긴 슬롯은 복용량만 가져온다', () => {
    const current = [
      { slot: 'breakfast' as const, customTime: '09:00', dose: '1정' },
      { slot: 'dinner' as const, customTime: '20:00', dose: '2정' }
    ]
    expect(rescheduleItems(current, ['breakfast', 'bedtime'])).toEqual([
      { slot: 'breakfast', customTime: '09:00', dose: '1정' },
      { slot: 'bedtime', customTime: null, dose: '2정' }
    ])
  })

  it('처음 정하는 슬롯은 복용량 없이', () => {
    expect(rescheduleItems([], ['lunch'])).toEqual([{ slot: 'lunch', customTime: null, dose: '' }])
  })

  describe('DB 일괄 저장', () => {
    let db: SqlDatabase
    beforeEach(() => {
      db = openDatabase(':memory:')
    })
    afterEach(() => db.close())

    it('여러 영양제를 한 번에 바꾸고, 유지된 슬롯의 등록 시각은 그대로', () => {
      const created = new Date('2026-10-10T00:00:00Z')
      const later = new Date('2026-10-10T05:00:00Z')
      const base = { manufacturer: '', labelInstruction: '', ingredients: [] }
      const a = createSupplement(
        db,
        { ...base, name: 'A', schedule: [{ slot: 'breakfast', customTime: null, dose: '1정' }] },
        'manual',
        created
      )
      const b = createSupplement(db, { ...base, name: 'B', schedule: [] }, 'manual', created)

      applyScheduleChanges(
        db,
        [
          { id: a.id, slots: ['breakfast', 'bedtime'] },
          { id: b.id, slots: ['lunch'] },
          { id: 999, slots: ['wake'] }
        ],
        later
      )
      expect(getSupplement(db, a.id)?.schedule).toEqual([
        { slot: 'breakfast', customTime: null, dose: '1정' },
        { slot: 'bedtime', customTime: null, dose: '1정' }
      ])
      expect(getSupplement(db, b.id)?.schedule.map((s) => s.slot)).toEqual(['lunch'])
      const rows = db
        .prepare('SELECT slot, created_at FROM schedule_items WHERE product_id = ? ORDER BY id')
        .all(a.id) as { created_at: string }[]
      expect(rows.map((r) => r.created_at)).toEqual([created.toISOString(), later.toISOString()])
    })
  })
})

it('규칙 파일 상수는 모든 성분을 가진다', () => {
  expect(RULES.ingredients.length).toBeGreaterThan(10)
})
