import { describe, expect, it } from 'vitest'
import {
  birthDatePart,
  formatDateForField,
  parseFlexibleDate,
} from './date'

describe('parseFlexibleDate', () => {
  it('parses day-first dates like 14/09/2004', () => {
    expect(parseFlexibleDate('14/09/2004')).toEqual({
      year: 2004,
      month: 9,
      day: 14,
    })
  })

  it('parses ISO dates', () => {
    expect(parseFlexibleDate('2004-09-14')).toEqual({
      year: 2004,
      month: 9,
      day: 14,
    })
  })

  it('treats 09/14/2004 as month-first when the second number is > 12', () => {
    expect(parseFlexibleDate('09/14/2004')).toEqual({
      year: 2004,
      month: 9,
      day: 14,
    })
  })
})

describe('formatDateForField', () => {
  it('writes YYYY-MM-DD for native date pickers', () => {
    expect(formatDateForField('14/09/2004', 'date', 'Date of birth')).toBe(
      '2004-09-14',
    )
  })

  it('keeps day-first text when the field is a normal input', () => {
    expect(formatDateForField('14/09/2004', 'text', 'Date of birth')).toBe(
      '14/09/2004',
    )
  })

  it('uses MM/DD/YYYY when the placeholder asks for it', () => {
    expect(
      formatDateForField('14/09/2004', 'text', 'MM/DD/YYYY'),
    ).toBe('09/14/2004')
  })
})

describe('birthDatePart', () => {
  it('detects birth day/month/year controls', () => {
    expect(birthDatePart('Date of birth')).toBeNull()
    expect(birthDatePart('Birth month')).toBe('month')
    expect(birthDatePart('Year')).toBe('year')
  })
})
