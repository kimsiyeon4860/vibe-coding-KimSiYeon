import { describe, expect, it } from 'vitest'
import { parseSupplementDraft } from '../src/shared/supplementInput'
import type { SupplementDraft } from '../src/shared/types'

const draft = (overrides: Partial<SupplementDraft> = {}): SupplementDraft => ({
  name: '비타민D',
  manufacturer: '',
  labelInstruction: '',
  ingredients: [],
  schedule: [],
  ...overrides
})

describe('parseSupplementDraft', () => {
  it('앞뒤 공백을 지우고 통과시킨다', () => {
    const result = parseSupplementDraft(
      draft({ name: '  오메가3 ', manufacturer: ' 종근당 ', labelInstruction: ' 1일 1회 ' })
    )
    expect(result).toEqual({
      ok: true,
      value: { name: '오메가3', manufacturer: '종근당', labelInstruction: '1일 1회', ingredients: [], schedule: [] }
    })
  })

  it('제품명이 비면 오류', () => {
    const result = parseSupplementDraft(draft({ name: '   ' }))
    expect(result).toEqual({ ok: false, errors: ['제품명을 입력해 주세요'] })
  })

  it('제품명이 너무 길면 오류', () => {
    const result = parseSupplementDraft(draft({ name: '가'.repeat(101) }))
    expect(result.ok).toBe(false)
  })

  it('함량을 숫자로 바꾸고 쉼표를 허용한다', () => {
    const result = parseSupplementDraft(
      draft({
        ingredients: [
          { name: '비타민 C', amount: '1,000', unit: 'mg' },
          { name: '비타민 D', amount: '25.5', unit: 'μg' }
        ]
      })
    )
    expect(result.ok && result.value.ingredients).toEqual([
      { name: '비타민 C', amount: 1000, unit: 'mg' },
      { name: '비타민 D', amount: 25.5, unit: 'μg' }
    ])
  })

  it('함량을 비우면 null', () => {
    const result = parseSupplementDraft(draft({ ingredients: [{ name: '유산균', amount: ' ', unit: '' }] }))
    expect(result.ok && result.value.ingredients).toEqual([{ name: '유산균', amount: null, unit: '' }])
  })

  it('완전히 빈 성분 행은 무시한다', () => {
    const result = parseSupplementDraft(draft({ ingredients: [{ name: '', amount: '', unit: '' }] }))
    expect(result.ok && result.value.ingredients).toEqual([])
  })

  it('성분명 없이 함량만 있으면 몇 번째 행인지 알려준다', () => {
    const result = parseSupplementDraft(
      draft({
        ingredients: [
          { name: '아연', amount: '8', unit: 'mg' },
          { name: '', amount: '10', unit: 'mg' }
        ]
      })
    )
    expect(result).toEqual({ ok: false, errors: ['성분 2: 성분명을 입력해 주세요'] })
  })

  it.each(['abc', '-1', '1e400'])('잘못된 함량 %s 은 오류', (amount) => {
    const result = parseSupplementDraft(draft({ ingredients: [{ name: '철분', amount, unit: 'mg' }] }))
    expect(result).toEqual({ ok: false, errors: ['성분 1: 함량은 0 이상의 숫자로 입력해 주세요'] })
  })

  it('객체가 아닌 값은 거부한다', () => {
    expect(parseSupplementDraft(null).ok).toBe(false)
    expect(parseSupplementDraft('비타민').ok).toBe(false)
  })

  it('오류를 한 번에 모두 알려준다', () => {
    const result = parseSupplementDraft(draft({ name: '', ingredients: [{ name: '', amount: 'x', unit: '' }] }))
    expect(result.ok === false && result.errors).toHaveLength(3)
  })

  describe('복용 시점', () => {
    it('슬롯 순서로 정렬하고 시간 형식을 맞춘다', () => {
      const result = parseSupplementDraft(
        draft({
          schedule: [
            { slot: 'bedtime', customTime: '', dose: ' 1정 ' },
            { slot: 'breakfast', customTime: ' 09:05 ', dose: '' }
          ]
        })
      )
      expect(result.ok && result.value.schedule).toEqual([
        { slot: 'breakfast', customTime: '09:05', dose: '' },
        { slot: 'bedtime', customTime: null, dose: '1정' }
      ])
    })

    it('잘못된 시간은 슬롯 이름과 함께 알려준다', () => {
      const result = parseSupplementDraft(draft({ schedule: [{ slot: 'lunch', customTime: '25:00', dose: '' }] }))
      expect(result).toEqual({ ok: false, errors: ['점심 식후: 시간을 확인해 주세요'] })
    })

    it('없는 슬롯은 거부한다', () => {
      const result = parseSupplementDraft(draft({ schedule: [{ slot: 'brunch', customTime: '', dose: '' }] }))
      expect(result.ok).toBe(false)
    })

    it('같은 슬롯이 두 번 오면 하나만 남긴다', () => {
      const result = parseSupplementDraft(
        draft({
          schedule: [
            { slot: 'wake', customTime: '', dose: 'a' },
            { slot: 'wake', customTime: '', dose: 'b' }
          ]
        })
      )
      expect(result.ok && result.value.schedule).toEqual([{ slot: 'wake', customTime: null, dose: 'b' }])
    })
  })
})
