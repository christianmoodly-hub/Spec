export interface CvContact {
  location: string
  phone: string
  email: string
  portfolio: string
}

export interface CvSkillGroup {
  category: string
  items: string[]
}

export interface CvExperience {
  title: string
  company: string
  location: string
  start: string
  end: string
  bullets: string[]
}

export interface CvEducation {
  institution: string
  qualification: string
  start: string
  end: string
  details: string
}

export interface CvDocument {
  name: string
  contact: CvContact
  summary: string
  skills: CvSkillGroup[]
  experience: CvExperience[]
  education: CvEducation[]
}

export const CV_SECTION = {
  summary: 'SUMMARY',
  skills: 'SKILLS',
  experience: 'EXPERIENCE',
  education: 'EDUCATION',
} as const

const MONTHS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
] as const

const JSON_ERROR = 'The tailored CV was not valid JSON. Please try again.'

function fail(message: string): never {
  throw new Error(message)
}

function asString(value: unknown): string {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(value)
  }
  if (typeof value !== 'string') {
    return ''
  }
  return value.replace(/\s+/g, ' ').trim()
}

function cleanBullet(value: string): string {
  return value.replace(/^(?:[•●▪◦*-]|\u2013|\u2014)\s+/, '').trim()
}

function asStringList(value: unknown, label: string): string[] {
  if (value == null) {
    return []
  }
  if (typeof value === 'string') {
    return value
      .split(/\n+/)
      .map((item) => asString(item))
      .filter(Boolean)
  }
  if (!Array.isArray(value)) {
    fail(`The tailored CV JSON has an invalid ${label} list. Please try again.`)
  }
  return value.map(asString).filter(Boolean)
}

function monthName(token: string): string | null {
  const index = MONTHS.findIndex(
    (month) => month.toLowerCase() === token.slice(0, 3).toLowerCase(),
  )
  return index >= 0 ? MONTHS[index] : null
}

export function formatCvDate(value: string): string {
  const trimmed = value.trim()
  if (!trimmed) {
    return ''
  }
  if (/^(ongoing|present|current|now|to date)$/i.test(trimmed)) {
    return 'Present'
  }
  const named = trimmed.match(
    /^(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+(\d{4})$/i,
  )
  if (named) {
    const month = monthName(named[1])
    return month ? `${month} ${named[2]}` : trimmed
  }
  const iso = trimmed.match(/^(\d{4})-(\d{2})(?:-\d{2})?$/)
  if (iso) {
    const month = Number(iso[2])
    if (month >= 1 && month <= 12) {
      return `${MONTHS[month - 1]} ${iso[1]}`
    }
  }
  const slash = trimmed.match(/^(\d{1,2})[/.-](\d{4})$/)
  if (slash) {
    const month = Number(slash[1])
    if (month >= 1 && month <= 12) {
      return `${MONTHS[month - 1]} ${slash[2]}`
    }
  }
  if (/^\d{4}$/.test(trimmed)) {
    return trimmed
  }
  return trimmed
}

function looksLikeDate(value: string): boolean {
  return /\d|present|ongoing|current|jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec/i.test(
    value,
  )
}

function normalizeRange(start: string, end: string): { start: string; end: string } {
  const left = start.trim()
  const right = end.trim()
  if (!right) {
    const parts = left.split(/\s*[\u2013\u2014-]\s*/)
    if (
      parts.length === 2 &&
      looksLikeDate(parts[0]) &&
      looksLikeDate(parts[1])
    ) {
      return { start: formatCvDate(parts[0]), end: formatCvDate(parts[1]) }
    }
  }
  return { start: formatCvDate(left), end: formatCvDate(right) }
}

export function formatDateRange(start: string, end: string): string {
  const range = normalizeRange(start, end)
  if (range.start && range.end) {
    return `${range.start} \u2013 ${range.end}`
  }
  return range.start || range.end
}

export function contactLine(contact: CvContact): string {
  return [contact.location, contact.phone, contact.email, contact.portfolio]
    .map((part) => part.trim())
    .filter(Boolean)
    .join(' | ')
}

export function companyLine(company: string, location: string): string {
  return [company.trim(), location.trim()].filter(Boolean).join(', ')
}

function stripJsonFences(raw: string): string {
  return raw
    .trim()
    .replace(/^\uFEFF/, '')
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim()
}

function relaxJson(text: string): string {
  return text.replace(/[\u201C\u201D]/g, '"').replace(/,\s*([}\]])/g, '$1')
}

function parseJsonText(text: string): unknown {
  return JSON.parse(relaxJson(text)) as unknown
}

function parseJsonObject(raw: string): unknown {
  const stripped = stripJsonFences(raw)
  try {
    return parseJsonText(stripped)
  } catch {
    const start = stripped.indexOf('{')
    const end = stripped.lastIndexOf('}')
    if (start < 0 || end <= start) {
      fail(JSON_ERROR)
    }
    try {
      return parseJsonText(stripped.slice(start, end + 1))
    } catch {
      fail(JSON_ERROR)
    }
  }
}

function unwrapCvPayload(value: unknown): unknown {
  if (typeof value === 'string' && value.trim().startsWith('{')) {
    try {
      return unwrapCvPayload(parseJsonText(value))
    } catch {
      return value
    }
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return value
  }
  const record = value as Record<string, unknown>
  const hasCvFields =
    'name' in record || 'experience' in record || 'summary' in record
  if (hasCvFields) {
    return value
  }
  for (const key of ['cv', 'resume', 'document', 'data', 'result']) {
    const inner = record[key]
    if (inner && typeof inner === 'object') {
      return inner
    }
  }
  return value
}

function asContact(value: unknown): CvContact {
  if (value == null) {
    return { location: '', phone: '', email: '', portfolio: '' }
  }
  if (typeof value === 'string') {
    return { location: asString(value), phone: '', email: '', portfolio: '' }
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    fail('The tailored CV JSON has an invalid contact block. Please try again.')
  }
  const record = value as Record<string, unknown>
  return {
    location: asString(record.location),
    phone: asString(record.phone),
    email: asString(record.email),
    portfolio: asString(record.portfolio),
  }
}

function asSkills(value: unknown): CvSkillGroup[] {
  if (Array.isArray(value) && value.every((item) => typeof item === 'string')) {
    const items = value.map(asString).filter(Boolean)
    return items.length > 0 ? [{ category: 'Skills', items }] : []
  }
  return requireRecords(value, 'skills').flatMap((record) => {
    const items = asStringList(record.items, 'skills').map(cleanBullet)
    if (items.length === 0) {
      return []
    }
    return [{ category: asString(record.category), items }]
  })
}

function requireRecords(value: unknown, label: string): Record<string, unknown>[] {
  if (value == null) {
    return []
  }
  if (!Array.isArray(value)) {
    fail(`The tailored CV JSON has an invalid ${label} list. Please try again.`)
  }
  return value.map((item) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      fail(`The tailored CV JSON has an invalid ${label} entry. Please try again.`)
    }
    return item as Record<string, unknown>
  })
}

function asExperience(value: unknown): CvExperience[] {
  return requireRecords(value, 'experience').flatMap((record) => {
    const range = normalizeRange(asString(record.start), asString(record.end))
    const entry: CvExperience = {
      title: asString(record.title),
      company: asString(record.company),
      location: asString(record.location),
      start: range.start,
      end: range.end,
      bullets: asStringList(record.bullets, 'experience bullets').map(cleanBullet),
    }
    const hasContent = Boolean(
      entry.title ||
        entry.company ||
        entry.location ||
        entry.start ||
        entry.end ||
        entry.bullets.length,
    )
    return hasContent ? [entry] : []
  })
}

function asEducation(value: unknown): CvEducation[] {
  return requireRecords(value, 'education').flatMap((record) => {
    const range = normalizeRange(asString(record.start), asString(record.end))
    const entry: CvEducation = {
      institution: asString(record.institution),
      qualification: asString(record.qualification),
      start: range.start,
      end: range.end,
      details: asString(record.details),
    }
    const hasContent = Boolean(
      entry.institution ||
        entry.qualification ||
        entry.start ||
        entry.end ||
        entry.details,
    )
    return hasContent ? [entry] : []
  })
}

export function parseCvDocument(raw: string): CvDocument {
  const value = unwrapCvPayload(parseJsonObject(raw))
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    fail('The tailored CV JSON was not an object. Please try again.')
  }
  const record = value as Record<string, unknown>
  return {
    name: asString(record.name),
    contact: asContact(record.contact),
    summary: asString(record.summary),
    skills: asSkills(record.skills),
    experience: asExperience(record.experience),
    education: asEducation(record.education),
  }
}

export function cvToPlainText(cv: CvDocument): string {
  const blocks: string[] = []
  if (cv.name) {
    blocks.push(cv.name)
  }
  const contact = contactLine(cv.contact)
  if (contact) {
    blocks.push(contact)
  }
  if (cv.summary) {
    blocks.push(`${CV_SECTION.summary}\n${cv.summary}`)
  }
  if (cv.skills.length > 0) {
    const lines = cv.skills.map((group) =>
      group.category
        ? `${group.category}: ${group.items.join(', ')}`
        : group.items.join(', '),
    )
    blocks.push(`${CV_SECTION.skills}\n${lines.join('\n')}`)
  }
  if (cv.experience.length > 0) {
    const roles = cv.experience.map((entry) => {
      const lines = [
        [entry.title, formatDateRange(entry.start, entry.end)]
          .filter(Boolean)
          .join('  '),
        companyLine(entry.company, entry.location),
        ...entry.bullets.map((bullet) => `• ${bullet}`),
      ].filter(Boolean)
      return lines.join('\n')
    })
    blocks.push(`${CV_SECTION.experience}\n${roles.join('\n\n')}`)
  }
  if (cv.education.length > 0) {
    const schools = cv.education.map((entry) => {
      const lines = [
        [entry.institution, formatDateRange(entry.start, entry.end)]
          .filter(Boolean)
          .join('  '),
        entry.qualification,
        entry.details,
      ].filter(Boolean)
      return lines.join('\n')
    })
    blocks.push(`${CV_SECTION.education}\n${schools.join('\n\n')}`)
  }
  return blocks.join('\n\n')
}

function fileToken(value: string): string {
  const cleaned = value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[<>:"/\\|?*\u0000-\u001f]+/g, ' ')
    .replace(/[^\w.-]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^[_.-]+|[_.-]+$/g, '')
  return cleaned.slice(0, 40)
}

export function cvDownloadName(
  personName: string,
  company: string,
  extension: 'pdf' | 'docx',
): string {
  const parts = personName
    .trim()
    .split(/\s+/)
    .map(fileToken)
    .filter(Boolean)
  const person =
    parts.length >= 2
      ? `${parts[0]}_${parts[parts.length - 1]}`
      : (parts[0] ?? 'Name')
  const employer = fileToken(company) || 'Company'
  return `${person}_CV_${employer}.${extension}`
}
