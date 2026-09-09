import { describe, expect, it } from 'vitest'
import { emptyStructuredFields } from '../profileFields'
import {
  identToText,
  matchField,
  normalizeText,
  type ScannedField,
} from './matcher'
import type { ProfileStructuredFields } from '../../types'

function field(partial: Partial<ScannedField>): ScannedField {
  return {
    label: '',
    name: '',
    id: '',
    placeholder: '',
    type: 'text',
    ...partial,
  }
}

function profile(
  patch?: Partial<ProfileStructuredFields>,
): ProfileStructuredFields {
  const base = emptyStructuredFields()
  return {
    ...base,
    ...patch,
    address: { ...base.address, ...patch?.address },
    eeoAnswers: { ...base.eeoAnswers, ...patch?.eeoAnswers },
    customFields: { ...base.customFields, ...patch?.customFields },
  }
}

const filled = profile({
  fullName: 'Ada Lovelace',
  email: 'ada@example.com',
  phone: '+27 82 000 0000',
  address: {
    street: '1 Computing Lane',
    city: 'Cape Town',
    stateProvince: 'Western Cape',
    postalCode: '8001',
    country: 'South Africa',
  },
  linkedinUrl: 'https://linkedin.com/in/ada',
  portfolioUrl: 'https://ada.dev',
  workAuthorization: 'Authorized to work in South Africa, no sponsorship needed',
  yearsExperience: '8',
  salaryExpectation: 'R45k–R55k',
  noticePeriod: '1 month',
  eeoAnswers: {
    'Are you Hispanic or Latino?': 'No',
  },
  customFields: {
    'How did you hear about us?': 'Referral',
    'Do you have a valid drivers licence?': 'Yes',
  },
})

describe('normalizeText', () => {
  it('lowercases and strips punctuation', () => {
    expect(normalizeText("E-mail address:")).toBe('e mail address')
    expect(normalizeText('LinkedIn URL')).toBe('linkedin url')
  })
})

describe('identToText', () => {
  it('splits camelCase and snake_case', () => {
    expect(normalizeText(identToText('applicantEmail'))).toBe('applicant email')
    expect(normalizeText(identToText('user_phone_number'))).toBe(
      'user phone number',
    )
  })
})

describe('matchField synonyms', () => {
  it('maps common full-name labels', () => {
    expect(matchField(field({ label: 'Full name' }), filled)).toEqual({
      status: 'matched',
      value: 'Ada Lovelace',
      key: 'fullName',
    })
    expect(matchField(field({ label: 'Applicant name' }), filled)).toMatchObject({
      status: 'matched',
      key: 'fullName',
    })
    expect(matchField(field({ label: 'Your name' }), filled)).toMatchObject({
      status: 'matched',
      key: 'fullName',
    })
  })

  it('does not guess first or last name', () => {
    expect(matchField(field({ label: 'First name' }), filled)).toEqual({
      status: 'unmatched',
    })
    expect(matchField(field({ label: 'Last name' }), filled)).toEqual({
      status: 'unmatched',
    })
    expect(matchField(field({ label: 'Surname' }), filled)).toEqual({
      status: 'unmatched',
    })
  })

  it('maps email, phone, and linkedin wording', () => {
    expect(matchField(field({ label: 'E-mail address' }), filled)).toMatchObject({
      key: 'email',
      value: 'ada@example.com',
    })
    expect(matchField(field({ label: 'Mobile number' }), filled)).toMatchObject({
      key: 'phone',
    })
    expect(
      matchField(field({ label: 'LinkedIn profile URL' }), filled),
    ).toMatchObject({ key: 'linkedinUrl' })
    expect(matchField(field({ label: 'LinkedIn' }), filled)).toMatchObject({
      key: 'linkedinUrl',
    })
  })

  it('maps address parts', () => {
    expect(matchField(field({ label: 'Street address' }), filled)).toMatchObject({
      key: 'address.street',
    })
    expect(matchField(field({ label: 'City' }), filled)).toMatchObject({
      key: 'address.city',
      value: 'Cape Town',
    })
    expect(matchField(field({ label: 'State / Province' }), filled)).toMatchObject(
      { key: 'address.stateProvince' },
    )
    expect(matchField(field({ label: 'ZIP code' }), filled)).toMatchObject({
      key: 'address.postalCode',
    })
    expect(matchField(field({ label: 'Country' }), filled)).toMatchObject({
      key: 'address.country',
    })
  })

  it('does not match city of birth or manager email', () => {
    expect(matchField(field({ label: 'City of birth' }), filled)).toEqual({
      status: 'unmatched',
    })
    expect(matchField(field({ label: 'Manager email' }), filled)).toEqual({
      status: 'unmatched',
    })
    expect(
      matchField(field({ label: 'Emergency contact phone' }), filled),
    ).toEqual({ status: 'unmatched' })
  })

  it('maps work, experience, salary, and notice labels', () => {
    expect(
      matchField(field({ label: 'Are you authorized to work?' }), filled),
    ).toMatchObject({ key: 'workAuthorization' })
    expect(
      matchField(field({ label: 'Years of experience' }), filled),
    ).toMatchObject({ key: 'yearsExperience', value: '8' })
    expect(
      matchField(field({ label: 'Salary expectation' }), filled),
    ).toMatchObject({ key: 'salaryExpectation' })
    expect(
      matchField(field({ label: 'When can you start?' }), filled),
    ).toMatchObject({ key: 'noticePeriod' })
  })

  it('uses name/id only when label is missing', () => {
    expect(
      matchField(field({ name: 'applicant_email' }), filled),
    ).toMatchObject({ key: 'email' })
    expect(
      matchField(
        field({ label: 'How did you hear about us?', name: 'email' }),
        filled,
      ),
    ).toMatchObject({ key: 'customFields' })
  })

  it('respects input type', () => {
    expect(
      matchField(field({ label: 'Contact', type: 'email' }), filled),
    ).toEqual({ status: 'unmatched' })
    expect(
      matchField(field({ label: 'Email', type: 'email' }), filled),
    ).toMatchObject({ key: 'email' })
    expect(
      matchField(field({ label: 'Phone', type: 'tel' }), filled),
    ).toMatchObject({ key: 'phone' })
    expect(
      matchField(field({ label: 'Email', type: 'tel' }), filled),
    ).toEqual({ status: 'unmatched' })
    expect(
      matchField(field({ label: 'LinkedIn', type: 'url' }), filled),
    ).toMatchObject({ key: 'linkedinUrl' })
  })

  it('never fills password or file fields', () => {
    expect(
      matchField(field({ label: 'Email', type: 'password' }), filled),
    ).toEqual({ status: 'unmatched' })
    expect(
      matchField(field({ label: 'Resume', type: 'file' }), filled),
    ).toEqual({ status: 'unmatched' })
  })

  it('does not match empty stored values', () => {
    expect(
      matchField(field({ label: 'Full name' }), emptyStructuredFields()),
    ).toEqual({ status: 'unmatched' })
  })
})

describe('matchField customFields and eeoAnswers', () => {
  it('matches an exact custom question label', () => {
    expect(
      matchField(field({ label: 'How did you hear about us?' }), filled),
    ).toEqual({
      status: 'matched',
      value: 'Referral',
      key: 'customFields',
      recordKey: 'How did you hear about us?',
    })
  })

  it('matches a near-exact long custom question', () => {
    expect(
      matchField(
        field({ label: 'Please enter: do you have a valid drivers licence' }),
        filled,
      ),
    ).toMatchObject({
      status: 'matched',
      key: 'customFields',
      value: 'Yes',
    })
  })

  it('does not loosely match a short custom label', () => {
    const withShort = profile({
      customFields: { Name: 'Should not fill first name' },
      fullName: filled.fullName,
    })
    expect(matchField(field({ label: 'First name' }), withShort)).toEqual({
      status: 'unmatched',
    })
  })

  it('matches recorded EEO answers', () => {
    expect(
      matchField(field({ label: 'Are you Hispanic or Latino?' }), filled),
    ).toMatchObject({
      key: 'eeoAnswers',
      value: 'No',
    })
  })
})

describe('matchField unmatched', () => {
  it('returns unmatched when nothing is confident', () => {
    expect(
      matchField(field({ label: 'Favorite programming language' }), filled),
    ).toEqual({ status: 'unmatched' })
  })
})
