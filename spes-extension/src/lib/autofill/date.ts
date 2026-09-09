export interface DateParts {
  year: number
  month: number
  day: number
}

const MONTHS: Record<string, number> = {
  january: 1,
  jan: 1,
  february: 2,
  feb: 2,
  march: 3,
  mar: 3,
  april: 4,
  apr: 4,
  may: 5,
  june: 6,
  jun: 6,
  july: 7,
  jul: 7,
  august: 8,
  aug: 8,
  september: 9,
  sep: 9,
  sept: 9,
  october: 10,
  oct: 10,
  november: 11,
  nov: 11,
  december: 12,
  dec: 12,
}

export function parseFlexibleDate(raw: string): DateParts | null {
  const text = raw.trim()
  if (!text) {
    return null
  }
  const iso = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[t\s].*)?$/i)
  if (iso) {
    return validParts(Number(iso[1]), Number(iso[2]), Number(iso[3]))
  }
  const named = text.match(
    /^(\d{1,2})\s+([a-z]+)\s+(\d{4})$/i,
  )
  if (named) {
    const month = MONTHS[named[2].toLowerCase()]
    if (month) {
      return validParts(Number(named[3]), month, Number(named[1]))
    }
  }
  const parts = text.match(/^(\d{1,2})[/\-.]+(\d{1,2})[/\-.]+(\d{2,4})$/)
  if (!parts) {
    return null
  }
  let year = Number(parts[3])
  if (year < 100) {
    year += year >= 50 ? 1900 : 2000
  }
  const first = Number(parts[1])
  const second = Number(parts[2])
  if (first > 12) {
    return validParts(year, second, first)
  }
  if (second > 12) {
    return validParts(year, first, second)
  }
  return validParts(year, second, first)
}

export function formatIsoDate(parts: DateParts): string {
  return `${String(parts.year).padStart(4, '0')}-${String(parts.month).padStart(2, '0')}-${String(parts.day).padStart(2, '0')}`
}

export function formatDateForField(
  raw: string,
  type: string,
  hint: string,
): string {
  const parts = parseFlexibleDate(raw)
  if (!parts) {
    return raw.trim()
  }
  const kind = type.trim().toLowerCase()
  if (kind === 'date') {
    return formatIsoDate(parts)
  }
  if (kind === 'datetime-local') {
    return `${formatIsoDate(parts)}T00:00`
  }
  if (kind === 'month') {
    return `${String(parts.year).padStart(4, '0')}-${String(parts.month).padStart(2, '0')}`
  }
  const folded = hint.toLowerCase()
  if (/mm\s*\/\s*dd/.test(folded) || /\bmdy\b/.test(folded)) {
    return `${pad(parts.month)}/${pad(parts.day)}/${parts.year}`
  }
  if (/yyyy\s*-?\s*mm\s*-?\s*dd/.test(folded) || /iso/.test(folded)) {
    return formatIsoDate(parts)
  }
  return `${pad(parts.day)}/${pad(parts.month)}/${parts.year}`
}

export function datePartNeedles(
  parts: DateParts,
  part: 'day' | 'month' | 'year',
): string[] {
  if (part === 'year') {
    return [String(parts.year)]
  }
  if (part === 'day') {
    return [String(parts.day), pad(parts.day)]
  }
  const names = Object.entries(MONTHS)
    .filter(([, month]) => month === parts.month)
    .map(([name]) => name)
  return [String(parts.month), pad(parts.month), ...names]
}

export function birthDatePart(
  label: string,
): 'day' | 'month' | 'year' | null {
  const folded = label.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
  if (!folded) {
    return null
  }
  const birth = /\b(birth|birthday|dob|born)\b/.test(folded)
  if (/\byear\b|\byyyy\b/.test(folded) && (birth || folded === 'year')) {
    return birth || folded === 'year' ? 'year' : null
  }
  if (/\bmonth\b|\bmm\b/.test(folded) && (birth || folded === 'month')) {
    return 'month'
  }
  if (/\bday\b|\bdd\b/.test(folded) && (birth || folded === 'day')) {
    return 'day'
  }
  return null
}

function pad(value: number): string {
  return String(value).padStart(2, '0')
}

function validParts(
  year: number,
  month: number,
  day: number,
): DateParts | null {
  if (
    year < 1900 ||
    year > 2100 ||
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > 31
  ) {
    return null
  }
  const date = new Date(Date.UTC(year, month - 1, day))
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null
  }
  return { year, month, day }
}
