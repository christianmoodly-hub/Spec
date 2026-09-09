import { describe, expect, it } from 'vitest'
import {
  isPlaceholderOption,
  matchSelectOption,
  type SelectOption,
} from './selectMatch'

const country: SelectOption[] = [
  { value: '', text: 'Select…' },
  { value: 'ZA', text: 'South Africa' },
  { value: 'US', text: 'United States' },
  { value: 'GB', text: 'United Kingdom' },
]

describe('isPlaceholderOption', () => {
  it('treats empty and Select… as placeholders', () => {
    expect(isPlaceholderOption({ value: '', text: 'Select…' })).toBe(true)
    expect(isPlaceholderOption({ value: 'ZA', text: 'South Africa' })).toBe(
      false,
    )
  })
})

describe('matchSelectOption', () => {
  it('prefers exact text, then value', () => {
    expect(matchSelectOption('South Africa', country)?.value).toBe('ZA')
    expect(matchSelectOption('ZA', country)?.text).toBe('South Africa')
  })

  it('matches case-insensitively', () => {
    expect(matchSelectOption('south africa', country)?.value).toBe('ZA')
  })

  it('uses a unique substring', () => {
    expect(matchSelectOption('United King', country)?.value).toBe('GB')
  })

  it('does not guess when several options contain the needle', () => {
    const yesNo: SelectOption[] = [
      { value: 'yes-auth', text: 'Yes, I am authorized' },
      { value: 'yes-sponsor', text: 'Yes, I need sponsorship' },
      { value: 'no', text: 'No' },
    ]
    expect(matchSelectOption('Yes', yesNo)).toBeNull()
  })

  it('returns null for empty or unmatched values', () => {
    expect(matchSelectOption('', country)).toBeNull()
    expect(matchSelectOption('Namibia', country)).toBeNull()
  })
})
