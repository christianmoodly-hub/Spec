import { describe, expect, it } from 'vitest'
import {
  contactLine,
  cvDownloadName,
  cvToPlainText,
  formatCvDate,
  formatDateRange,
  parseCvDocument,
} from './document'

const sample = `{
  "name": "Alex Morgan",
  "contact": { "location": "Cape Town", "phone": "+27 82 000 0000", "email": "alex@example.com", "portfolio": "alexmorgan.dev" },
  "summary": "Engineer who ships reliable web software for small teams.",
  "skills": [ { "category": "Languages", "items": ["TypeScript", "JavaScript"] } ],
  "experience": [
    {
      "title": "Software Engineer",
      "company": "Northwind",
      "location": "Cape Town",
      "start": "2023-01",
      "end": "Ongoing",
      "bullets": ["- Built a shared tracker used daily by a two-person team."]
    }
  ],
  "education": [
    {
      "institution": "University of Cape Town",
      "qualification": "BSc Computer Science",
      "start": "2018",
      "end": "2020",
      "details": ""
    }
  ]
}`

describe('parseCvDocument', () => {
  it('parses fenced JSON and normalises dates', () => {
    const cv = parseCvDocument('```json\n' + sample + '\n```')
    expect(cv.name).toBe('Alex Morgan')
    expect(cv.experience[0]?.end).toBe('Present')
    expect(cv.experience[0]?.start).toBe('Jan 2023')
    expect(cv.experience[0]?.bullets).toEqual([
      'Built a shared tracker used daily by a two-person team.',
    ])
    expect(contactLine(cv.contact)).toBe(
      'Cape Town | +27 82 000 0000 | alex@example.com | alexmorgan.dev',
    )
  })

  it('splits a date range left in the start field', () => {
    const cv = parseCvDocument(
      JSON.stringify({
        name: 'Alex Morgan',
        experience: [
          {
            title: 'Analyst',
            company: 'Contoso',
            start: 'March 2020 - Ongoing',
            bullets: ['Kept the books'],
          },
        ],
      }),
    )
    expect(formatDateRange(cv.experience[0].start, cv.experience[0].end)).toBe(
      'Mar 2020 \u2013 Present',
    )
  })

  it('accepts trailing commas and a wrapped payload', () => {
    const cv = parseCvDocument(`Here is the CV:
{"cv":{"name":"Alex Morgan","skills":["TypeScript","SQL",],"experience":[{"title":"Engineer","bullets":"Built the tracker\\nKept it fast",}]}}`)
    expect(cv.name).toBe('Alex Morgan')
    expect(cv.skills[0]?.items).toEqual(['TypeScript', 'SQL'])
    expect(cv.experience[0]?.bullets).toEqual([
      'Built the tracker',
      'Kept it fast',
    ])
  })

  it('keeps the real job title when the model repeats titles', () => {
    const repeated = [
      'Independent Developer / Support Specialistbal Direct Support Developer',
      ...Array.from({ length: 30 }, () => 'Developer'),
    ].join(' ')
    const cv = parseCvDocument(
      JSON.stringify({
        name: 'Alex Morgan',
        summary: 'Ships reliable software for small teams.',
        experience: [
          {
            title: repeated,
            company: 'Northwind',
            start: 'Jan 2023',
            end: 'Present',
            bullets: ['Built a shared tracker for the team.'],
          },
        ],
      }),
    )
    expect(cv.experience[0]?.title).toBe(
      'Independent Developer / Support Specialist',
    )
    expect(cv.experience[0]?.bullets).toEqual([
      'Built a shared tracker for the team.',
    ])
  })

  it('rejects malformed JSON', () => {
    expect(() => parseCvDocument('not json')).toThrow(/valid JSON/)
    expect(() => parseCvDocument('{"experience":"nope"}')).toThrow(/experience/)
  })
})

describe('formatCvDate', () => {
  it('maps current-role words to Present', () => {
    expect(formatCvDate('Ongoing')).toBe('Present')
    expect(formatCvDate('present')).toBe('Present')
    expect(formatCvDate('Sep 2020')).toBe('Sep 2020')
    expect(formatCvDate('')).toBe('')
  })
})

describe('cvDownloadName', () => {
  it('uses first name, last name, and company', () => {
    expect(cvDownloadName('Alex Morgan', 'Northwind Labs', 'pdf')).toBe(
      'Alex_Morgan_CV_Northwind_Labs.pdf',
    )
    expect(cvDownloadName('Alex', 'Acme/Corp', 'docx')).toBe('Alex_CV_Acme_Corp.docx')
  })
})

describe('cvToPlainText', () => {
  it('keeps section order', () => {
    const text = cvToPlainText(parseCvDocument(sample))
    const summary = text.indexOf('SUMMARY')
    const skills = text.indexOf('SKILLS')
    const experience = text.indexOf('EXPERIENCE')
    const education = text.indexOf('EDUCATION')
    expect(summary).toBeGreaterThan(-1)
    expect(summary).toBeLessThan(skills)
    expect(skills).toBeLessThan(experience)
    expect(experience).toBeLessThan(education)
    expect(text).toContain('Present')
    expect(text).not.toContain('Ongoing')
  })
})
