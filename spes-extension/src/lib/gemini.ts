/**
 * Gemini — used from the background worker only.
 * Do not import this module from content scripts (the API key is inlined
 * at build time and must not be injected into LinkedIn/Indeed pages).
 */

import type { ProfileStructuredFields } from '../types'
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
  "eeoAnswers": { [question: string]: string },
  "customFields": { [label: string]: string }
}

Rules:
- Use ONLY facts present in the notes. Do not invent contact details, employers, dates, or answers.
- If a field is unknown, use an empty string. For eeoAnswers and customFields, omit keys you cannot fill.
- yearsExperience, salaryExpectation, noticePeriod, and workAuthorization stay strings (keep the person's wording).
- Put recurring EEO / demographic answers in eeoAnswers, keyed by the question text.
- Put any other repeated one-off application answers in customFields, keyed by a short label.
- No markdown, no commentary, no extra top-level keys.`

const SELECT_OPTION_PROMPT = `You pick one option from a job-application dropdown for this person.
Return ONLY the exact option text from the list, copied character-for-character.
If nothing fits, or you would have to guess, return NONE.
Do not invent facts. Do not explain.`

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
  } catch {
    throw new Error(TRY_AGAIN)
  }

  if (!response.ok) {
    throw new Error(TRY_AGAIN)
  }

  let body: {
    candidates?: Array<{
      content?: { parts?: Array<{ text?: string }> }
    }>
  }
  try {
    body = (await response.json()) as typeof body
  } catch {
    throw new Error(TRY_AGAIN)
  }
  const raw = body.candidates?.[0]?.content?.parts?.[0]?.text
  if (!raw?.trim()) {
    throw new Error(TRY_AGAIN)
  }
  return raw.trim()
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
