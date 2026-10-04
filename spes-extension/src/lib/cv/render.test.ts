import { inflateSync } from 'node:zlib'
import JSZip from 'jszip'
import { describe, expect, it } from 'vitest'
import { parseCvDocument, type CvDocument } from './document'
import { renderCvDocxBuffer } from './renderDocx'
import { renderCvPdfBytes } from './renderPdf'
import { CV_STYLE } from './template'

function sampleCv(): CvDocument {
  return parseCvDocument(`{
    "name": "Alex Morgan",
    "contact": {
      "location": "Cape Town",
      "phone": "+27 82 000 0000",
      "email": "alex@example.com",
      "portfolio": "alexmorgan.dev"
    },
    "summary": "Engineer who ships reliable web software for small teams. Focused on clear interfaces and tools that stay fast.",
    "skills": [
      { "category": "Languages", "items": ["TypeScript", "JavaScript"] },
      { "category": "Tools", "items": ["React", "Firebase"] }
    ],
    "experience": [
      {
        "title": "Software Engineer",
        "company": "Northwind",
        "location": "Cape Town",
        "start": "Jan 2023",
        "end": "Ongoing",
        "bullets": [
          "Built a shared tracker used daily by a two-person team.",
          "Cut repeated form filling by structuring profile data for reuse."
        ]
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
  }`)
}

function longCv(): CvDocument {
  const experience = Array.from({ length: 8 }, (_, index) => ({
    title: `Role Marker ${index}`,
    company: `Company ${index}`,
    location: 'Remote',
    start: 'Jan 2020',
    end: 'Present',
    bullets: [
      `First result marker ${index} for this role.`,
      'Delivered a long project outcome that wraps onto a second line because the sentence keeps going past the measure of a normal CV line and then further still.',
      'Improved a second workflow with the same kind of long sentence so the entry occupies more vertical space than a short bullet would.',
      'Documented the handover so the next person could continue the work without a meeting.',
    ],
  }))
  return parseCvDocument(
    JSON.stringify({
      name: 'Alex Morgan',
      contact: {
        location: 'Cape Town',
        phone: '000',
        email: 'a@b.c',
        portfolio: 'example.dev',
      },
      summary: 'Short summary for the page break fixture.',
      skills: [{ category: 'Tools', items: ['TypeScript'] }],
      experience,
      education: [
        {
          institution: 'Example University',
          qualification: 'BSc',
          start: '2016',
          end: '2019',
          details: '',
        },
      ],
    }),
  )
}

function decodePdfLiteral(body: string): string {
  let out = ''
  for (let index = 0; index < body.length; index += 1) {
    const char = body[index]
    if (char !== '\\') {
      out += char
      continue
    }
    const next = body[index + 1]
    if (next === 'n') {
      out += '\n'
      index += 1
      continue
    }
    if (next === 'r' || next === 't' || next === '(' || next === ')' || next === '\\') {
      out += next === 't' ? '\t' : next === 'n' ? '\n' : next
      index += 1
      continue
    }
    const octal = /^[0-7]{1,3}/.exec(body.slice(index + 1))
    if (octal) {
      out += String.fromCharCode(Number.parseInt(octal[0], 8))
      index += octal[0].length
      continue
    }
    out += next ?? ''
    index += 1
  }
  return out
}

function pdfStreams(bytes: Uint8Array): string[] {
  const raw = Buffer.from(bytes).toString('latin1')
  const streams: string[] = []
  const pattern = /stream\r?\n([\s\S]*?)endstream/g
  for (const match of raw.matchAll(pattern)) {
    const data = Buffer.from(match[1], 'latin1')
    try {
      streams.push(inflateSync(data).toString('latin1'))
    } catch {
      streams.push(data.toString('latin1'))
    }
  }
  return streams
}

function stringsInStream(stream: string): string[] {
  const texts: string[] = []
  const literal = /\((?:\\.|[^\\)])*\)\s*Tj/g
  for (const match of stream.matchAll(literal)) {
    const body = match[0].slice(1, match[0].lastIndexOf(')'))
    texts.push(decodePdfLiteral(body))
  }
  return texts
}

function pdfPages(bytes: Uint8Array): string[] {
  return pdfStreams(bytes)
    .map((stream) => stringsInStream(stream).join('\n'))
    .filter((page) => page.trim().length > 0)
}

describe('CV pdf', () => {
  it('keeps selectable text in reading order', () => {
    const bytes = renderCvPdfBytes(sampleCv())
    const raw = Buffer.from(bytes).toString('latin1')
    expect(raw).not.toContain('/Subtype /Image')
    const streams = pdfStreams(bytes).join('\n')
    expect(streams).toMatch(/\)\s*Tj/)
    const pages = pdfPages(bytes)
    expect(pages.length).toBeGreaterThan(0)
    const text = pages.join('\n')
    const summary = text.indexOf('SUMMARY')
    const skills = text.indexOf('SKILLS')
    const experience = text.indexOf('EXPERIENCE')
    const education = text.indexOf('EDUCATION')
    expect(text.indexOf('Alex Morgan')).toBeGreaterThanOrEqual(0)
    expect(text.indexOf('Alex Morgan')).toBeLessThan(summary)
    expect(summary).toBeLessThan(skills)
    expect(skills).toBeLessThan(experience)
    expect(experience).toBeLessThan(education)
    expect(text).toContain('Software Engineer')
    expect(text).toContain('Northwind')
    expect(text).toContain('Present')
    expect(text).not.toContain('Ongoing')
    expect(text).toContain('alexmorgan.dev')
    expect(text).toContain('Languages')
    expect(text).toContain('TypeScript')
  })

  it('does not split a role heading from its first bullet', () => {
    const cv = longCv()
    const pages = pdfPages(renderCvPdfBytes(cv))
    expect(pages.length).toBeGreaterThan(1)
    for (const entry of cv.experience) {
      const titlePage = pages.findIndex((page) => page.includes(entry.title))
      const bulletPage = pages.findIndex((page) =>
        page.includes(entry.bullets[0] ?? ''),
      )
      expect(titlePage).toBeGreaterThanOrEqual(0)
      expect(bulletPage).toBe(titlePage)
    }
  })

  it('keeps text inside the 0.75 inch margin', () => {
    const streams = pdfStreams(renderCvPdfBytes(sampleCv())).join('\n')
    const positions: number[] = []
    for (const match of streams.matchAll(
      /1 0 0 1 ([\d.]+) ([\d.]+) Tm/g,
    )) {
      positions.push(Number(match[1]))
    }
    for (const match of streams.matchAll(/([\d.]+) ([\d.]+) Td/g)) {
      positions.push(Number(match[1]))
    }
    expect(positions.length).toBeGreaterThan(0)
    const marginPt = (CV_STYLE.page.marginMm * 72) / 25.4
    const pageWidthPt = (CV_STYLE.page.widthMm * 72) / 25.4
    for (const x of positions) {
      expect(x).toBeGreaterThanOrEqual(marginPt - 1)
      expect(x).toBeLessThanOrEqual(pageWidthPt - marginPt + 1)
    }
  })
})

describe('CV docx', () => {
  it('is a single-column text document with section rules', async () => {
    const zip = await JSZip.loadAsync(renderCvDocxBuffer(sampleCv()))
    const names = Object.keys(zip.files)
    expect(names.some((name) => name.startsWith('word/header'))).toBe(false)
    expect(names.some((name) => name.startsWith('word/footer'))).toBe(false)
    const xml = await zip.file('word/document.xml')!.async('string')
    expect(xml).not.toContain('<w:tbl')
    expect(xml).not.toContain('<w:drawing')
    expect(xml).not.toContain('<w:pict')
    expect(xml).toContain('w:top="1080"')
    expect(xml).toContain('w:bottom="1080"')
    expect(xml).toContain('w:left="1080"')
    expect(xml).toContain('w:right="1080"')
    expect(xml).toContain('<w:bottom')
    expect(xml).toContain('Arial')
    expect(xml).toContain('<w:keepNext')
    const texts = [...xml.matchAll(/<w:t[^>]*>([^<]*)<\/w:t>/g)].map(
      (match) => match[1],
    )
    const text = texts.join('\n')
    const summary = text.indexOf('SUMMARY')
    const skills = text.indexOf('SKILLS')
    const experience = text.indexOf('EXPERIENCE')
    const education = text.indexOf('EDUCATION')
    expect(text.indexOf('Alex Morgan')).toBeLessThan(summary)
    expect(summary).toBeLessThan(skills)
    expect(skills).toBeLessThan(experience)
    expect(experience).toBeLessThan(education)
    expect(text).toContain('Present')
    expect(text).not.toContain('Ongoing')
    expect(text).toContain('•')
  })
})
