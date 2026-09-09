import type { ProfileAddress, ProfileStructuredFields } from '../../types'

export function compactProfileContext(
  fields: ProfileStructuredFields,
  rawDump: string,
): string {
  const body: Record<string, unknown> = {}
  addString(body, 'fullName', fields.fullName)
  addString(body, 'email', fields.email)
  addString(body, 'phone', fields.phone)
  const address = compactAddress(fields.address)
  if (address) {
    body.address = address
  }
  addString(body, 'linkedinUrl', fields.linkedinUrl)
  addString(body, 'portfolioUrl', fields.portfolioUrl)
  addString(body, 'workAuthorization', fields.workAuthorization)
  addString(body, 'yearsExperience', fields.yearsExperience)
  addString(body, 'salaryExpectation', fields.salaryExpectation)
  addString(body, 'noticePeriod', fields.noticePeriod)
  if (Object.keys(fields.eeoAnswers).length > 0) {
    body.eeoAnswers = fields.eeoAnswers
  }
  if (Object.keys(fields.customFields).length > 0) {
    body.customFields = fields.customFields
  }
  addString(body, 'notes', rawDump.slice(0, 4_000))
  return JSON.stringify(body)
}

export function profileHasFillData(
  fields: ProfileStructuredFields,
  rawDump: string,
): boolean {
  return compactProfileContext(fields, rawDump) !== '{}'
}

function addString(
  body: Record<string, unknown>,
  key: string,
  value: string,
): void {
  const trimmed = value.trim()
  if (trimmed) {
    body[key] = trimmed
  }
}

function compactAddress(
  address: ProfileAddress,
): Record<string, string> | null {
  const out: Record<string, string> = {}
  for (const [key, value] of Object.entries(address)) {
    if (value.trim()) {
      out[key] = value.trim()
    }
  }
  return Object.keys(out).length > 0 ? out : null
}
