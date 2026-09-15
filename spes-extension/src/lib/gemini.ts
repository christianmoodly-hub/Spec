/**
 * Gemini — used from the background worker only.
 * Do not import this module from content scripts (the API key is inlined
 * at build time and must not be injected into LinkedIn/Indeed pages).
 */

import type { ProfileStructuredFields } from '../types'
import type { UnmatchedFormField } from './messages'
import { asStructuredFields } from './profileFields'

export interface ExtractedJob {
  title: string
  company: string
  description: string
  dueDate: string | null
}

export type GenerateKind = 'cv' | 'cover-letter'

export interface GenerateDocInput {
  kind: GenerateKind
  title: string
  company: string
  description: string
  baseCV: string
  reusableBullets: string[]
}

const EXTRACT_PROMPT = `You extract job-application fields from messy webpage text.
Return ONLY valid JSON with exactly these keys:
- title: string (job title)
- company: string (hiring company)
- description: string (concise role summary, 1-8 sentences, plain text)
- dueDate: string or null (ISO date YYYY-MM-DD if a deadline or closing date is clearly stated, otherwise null)

No markdown, no commentary, no extra keys. If a field is unknown, use an empty string (or null for dueDate).`

const PROFILE_PARSE_PROMPT = `You extract a person's application-profile fields from freeform notes they wrote about themselves.
Return ONLY valid JSON with exactly this shape:
{
  "fullName": string,
  "email": string,
  "phone": string,
  "address": {
    "street": string,
    "city": string,
    "stateProvince": string,
    "postalCode": string,
    "country": string
  },
  "linkedinUrl": string,
  "portfolioUrl": string,
  "workAuthorization": string,
  "yearsExperience": string,
  "salaryExpectation": string,
  "noticePeriod": string,
  "dateOfBirth": string,
  "eeoAnswers": { [question: string]: string },
  "customFields": { [label: string]: string }
}

Rules:
- Use ONLY facts present in the notes. Do not invent contact details, employers, dates, or answers.
- If a field is unknown, use an empty string. For eeoAnswers and customFields, omit keys you cannot fill.
- yearsExperience, salaryExpectation, noticePeriod, and workAuthorization stay strings (keep the person's wording).
- dateOfBirth: use day short-month year, like 14 Sep 2004.
- Put recurring EEO / demographic answers in eeoAnswers, keyed by the question text.
- Put any other repeated one-off application answers in customFields, keyed by a short label.
- No markdown, no commentary, no extra top-level keys.`

const SELECT_OPTION_PROMPT = `You pick one option from a job-application dropdown for this person.
Return ONLY the exact option text from the list, copied character-for-character.
If nothing fits, or you would have to guess, return NONE.
Do not invent facts. Do not explain.`

const FILL_UNMATCHED_PROMPT = `You fill leftover job-application form fields from this person's profile only.
Return ONLY valid JSON: { "answers": { "<id>": "<value>" } }
Rules:
- Use ONLY facts in the profile. Never invent names, dates, employers, or answers.
- If you are not sure, omit the key or set the value to NONE.
- For type "date", return YYYY-MM-DD.
- For type "datetime-local", return YYYY-MM-DDTHH:mm (use T00:00 if the time is unknown).
- For type "month", return YYYY-MM.
- If options are listed, return one option's exact text, character-for-character.
- Do not fill file, password, or hidden fields.`

const CV_PROMPT = `You tailor a CV to one job for both ATS parsers and a human recruiter.
Rules:
- Use ONLY facts from the base CV and reusable bullets. Do not invent jobs, dates, employers, tools, or achievements.
- Echo keywords and phrasing from the job description only when they honestly match the base CV.
- Reorder and rephrase to match this role. Drop or shorten weaker points.
- Return plain text only: no markdown fences, commentary, tables, columns, icons, or graphics.
- One column. Standard headings on their own lines, such as Summary, Skills, Experience, Education.
- Under Experience, put job title, employer, and dates on simple lines, then short bullets that start with "- ".
- Name and contact first if they appear in the base CV.`

const COVER_PROMPT = `You write a short cover letter for a job application.
Rules:
- Use ONLY facts from the base CV and reusable bullets. Do not invent experience.
- 3–5 short paragraphs, specific to this role and company.
- Return plain text only (no markdown fences, no commentary, no header like "Cover letter:").`

function apiKey(): string {
  const value = import.meta.env.VITE_GEMINI_API_KEY
  if (!value) {
    throw new Error(
      'Missing VITE_GEMINI_API_KEY. Add it to .env and run npm run build.',
    )
  }
  return value
}

function modelName(): string {
  return import.meta.env.VITE_GEMINI_MODEL || 'gemini-3.6-flash'
}

const TRY_AGAIN = "That didn't work. Please try again."

async function generateContent(options: {
  system: string
  user: string
  temperature: number
  json?: boolean
}): Promise<string> {
  let lastError: Error | null = null
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      return await generateContentOnce(options)
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error))
      const waitMs = retryDelayMs(lastError.message)
      if (waitMs == null || attempt === 1) {
        throw lastError
      }
      await sleep(waitMs)
    }
  }
  throw lastError ?? new Error(TRY_AGAIN)
}

async function generateContentOnce(options: {
  system: string
  user: string
  temperature: number
  json?: boolean
}): Promise<string> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName()}:generateContent?key=${encodeURIComponent(apiKey())}`
  let response: Response
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: options.system }] },
        contents: [{ role: 'user', parts: [{ text: options.user }] }],
        generationConfig: {
          temperature: options.temperature,
          maxOutputTokens: 4096,
          ...(options.json ? { responseMimeType: 'application/json' } : {}),
        },
      }),
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    throw new Error(message || TRY_AGAIN)
  }

  if (!response.ok) {
    throw new Error(await geminiHttpError(response))
  }

  let body: {
    candidates?: Array<{
      finishReason?: string
      content?: { parts?: Array<{ text?: string }> }
    }>
    error?: { message?: string }
  }
  try {
    body = (await response.json()) as typeof body
  } catch {
    throw new Error('Gemini returned a non-JSON response.')
  }
  if (body.error?.message) {
    throw new Error(body.error.message)
  }
  const candidate = body.candidates?.[0]
  const raw = candidate?.content?.parts?.[0]?.text
  if (!raw?.trim()) {
    const reason = candidate?.finishReason ?? 'empty'
    throw new Error(`Gemini returned no text (${reason}).`)
  }
  return raw.trim()
}

async function geminiHttpError(response: Response): Promise<string> {
  const detail = await response.text()
  try {
    const parsed = JSON.parse(detail) as {
      error?: {
        message?: string
        status?: string
        details?: Array<{ reason?: string }>
      }
    }
    const reason = parsed.error?.details?.find((d) => d.reason)?.reason
    if (
      response.status === 401 &&
      (reason === 'ACCESS_TOKEN_TYPE_UNSUPPORTED' ||
        /invalid authentication credentials/i.test(
          parsed.error?.message ?? '',
        ))
    ) {
      return (
        'Gemini API key rejected (401). Paste a full key from ' +
        'https://aistudio.google.com/apikey into VITE_GEMINI_API_KEY, ' +
        'then run npm run build and reload the extension.'
      )
    }
    const message = parsed.error?.message?.trim()
    if (message) {
      return `Gemini HTTP ${response.status}: ${message}`
    }
  } catch {
    /* use raw text */
  }
  const snippet = detail.replace(/\s+/g, ' ').trim().slice(0, 300)
  return snippet
    ? `Gemini HTTP ${response.status}: ${snippet}`
    : `Gemini HTTP ${response.status}`
}

function retryDelayMs(message: string): number | null {
  if (!/429|quota|rate.?limit|resource.?exhausted/i.test(message)) {
    return null
  }
  const seconds = message.match(/retry in (\d+(?:\.\d+)?)\s*s/i)
  if (seconds) {
    return Math.min(8_000, Math.max(1_500, Math.ceil(Number(seconds[1]) * 1000) + 250))
  }
  return 2_500
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms)
  })
}

function parseModelJson(raw: string): unknown {
  const stripped = raw
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim()
  const start = stripped.indexOf('{')
  const end = stripped.lastIndexOf('}')
  if (start < 0 || end <= start) {
    throw new Error('Gemini did not return JSON.')
  }
  return JSON.parse(stripped.slice(start, end + 1)) as unknown
}

function asExtractedJob(value: unknown): ExtractedJob {
  if (!value || typeof value !== 'object') {
    throw new Error('Gemini JSON was not an object.')
  }
  const record = value as Record<string, unknown>
  const dueRaw = record.dueDate
  let dueDate: string | null = null
  if (typeof dueRaw === 'string') {
    const match = dueRaw.trim().match(/^(\d{4}-\d{2}-\d{2})/)
    dueDate = match ? match[1] : null
  }
  return {
    title: String(record.title ?? '').trim(),
    company: String(record.company ?? '').trim(),
    description: String(record.description ?? '').trim(),
    dueDate,
  }
}

function stripFences(text: string): string {
  return text
    .replace(/^```(?:\w+)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim()
}

export async function extractJobFromText(
  pageText: string,
  pageUrl: string,
): Promise<ExtractedJob> {
  const text = pageText.trim().slice(0, 24_000)
  if (!text) {
    throw new Error('No page text to extract from.')
  }

  const raw = await generateContent({
    system: EXTRACT_PROMPT,
    user: `Page URL: ${pageUrl}\n\nPage text:\n${text}`,
    temperature: 0.2,
    json: true,
  })
  return asExtractedJob(parseModelJson(raw))
}

export async function generateApplicationDoc(
  input: GenerateDocInput,
): Promise<string> {
  const description = input.description.trim().slice(0, 12_000)
  const baseCV = input.baseCV.trim().slice(0, 20_000)
  if (!description) {
    throw new Error('This application has no description to tailor against.')
  }
  if (!baseCV) {
    throw new Error('Add your base CV in Options first.')
  }
  const bullets = input.reusableBullets
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 40)
  const bulletBlock =
    bullets.length > 0
      ? bullets.map((item) => `- ${item}`).join('\n')
      : '(none)'
  const user = [
    `Job title: ${input.title.trim() || '(unknown)'}`,
    `Company: ${input.company.trim() || '(unknown)'}`,
    `Job description:\n${description}`,
    `Base CV:\n${baseCV}`,
    `Reusable bullets:\n${bulletBlock}`,
  ].join('\n\n')
  const raw = await generateContent({
    system: input.kind === 'cv' ? CV_PROMPT : COVER_PROMPT,
    user,
    temperature: 0.5,
  })
  return stripFences(raw)
}

export async function parseProfileDump(
  rawDump: string,
): Promise<ProfileStructuredFields> {
  const text = rawDump.trim().slice(0, 24_000)
  if (!text) {
    throw new Error('Paste some notes about yourself first.')
  }
  const raw = await generateContent({
    system: PROFILE_PARSE_PROMPT,
    user: `Notes:\n${text}`,
    temperature: 0.2,
    json: true,
  })
  return asStructuredFields(parseModelJson(raw))
}

export async function pickSelectOption(input: {
  label: string
  options: string[]
  profileContext: string
  heuristicValue?: string
}): Promise<string | null> {
  const options = input.options.map((item) => item.trim()).filter(Boolean)
  if (options.length === 0) {
    return null
  }
  const listed = options.slice(0, 150)
  const heuristic = input.heuristicValue?.trim()
  const user = [
    `Question / field label:\n${input.label.trim() || '(none)'}`,
    heuristic ? `Heuristic suggestion (may or may not match an option):\n${heuristic}` : '',
    `Person's profile:\n${input.profileContext.trim() || '(empty)'}`,
    `Options:\n${listed.map((item) => `- ${item}`).join('\n')}`,
  ]
    .filter(Boolean)
    .join('\n\n')
  const raw = await generateContent({
    system: SELECT_OPTION_PROMPT,
    user,
    temperature: 0.1,
  })
  const picked = stripFences(raw).replace(/^["']|["']$/g, '').trim()
  if (!picked || /^none$/i.test(picked)) {
    return null
  }
  return picked
}

export async function fillUnmatchedFields(input: {
  fields: UnmatchedFormField[]
  profileContext: string
}): Promise<Record<string, string>> {
  const fields = input.fields.slice(0, 25)
  if (fields.length === 0) {
    return {}
  }
  const listed = fields
    .map((field) => {
      const options =
        field.options && field.options.length > 0
          ? `\n  options: ${JSON.stringify(field.options.slice(0, 80))}`
          : ''
      return `- id: ${field.id}\n  label: ${field.label}\n  type: ${field.type}${options}`
    })
    .join('\n')
  const raw = await generateContent({
    system: FILL_UNMATCHED_PROMPT,
    user: [
      `Person's profile:\n${input.profileContext.trim() || '(empty)'}`,
      `Fields:\n${listed}`,
    ].join('\n\n'),
    temperature: 0.1,
    json: true,
  })
  const parsed = parseModelJson(raw)
  if (!parsed || typeof parsed !== 'object') {
    return {}
  }
  const answers = (parsed as { answers?: unknown }).answers
  if (!answers || typeof answers !== 'object') {
    return {}
  }
  const out: Record<string, string> = {}
  for (const [id, value] of Object.entries(answers as Record<string, unknown>)) {
    const text = String(value ?? '').trim()
    if (!text || /^none$/i.test(text)) {
      continue
    }
    out[id] = text
  }
  return out
}
