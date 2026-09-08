/**
 * Gemini — used from the background worker only.
 * Do not import this module from content scripts (the API key is inlined
 * at build time and must not be injected into LinkedIn/Indeed pages).
 */

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

const CV_PROMPT = `You tailor a CV to a job description.
Rules:
- Use ONLY facts from the base CV and reusable bullets. Do not invent jobs, dates, employers, tools, or achievements.
- Reorder and rephrase to match the job. Drop or shorten weaker points.
- Return plain text only (no markdown fences, no commentary).
- Keep it scannable: name/contact if present, then short sections.`

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
  return import.meta.env.VITE_GEMINI_MODEL || 'gemini-2.0-flash'
}

async function generateContent(options: {
  system: string
  user: string
  temperature: number
  json?: boolean
}): Promise<string> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName()}:generateContent?key=${encodeURIComponent(apiKey())}`
  const response = await fetch(url, {
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

  if (!response.ok) {
    const detail = await response.text()
    throw new Error(
      `Gemini request failed (${response.status}): ${detail.slice(0, 280)}`,
    )
  }

  const body = (await response.json()) as {
    candidates?: Array<{
      content?: { parts?: Array<{ text?: string }> }
    }>
  }
  const raw = body.candidates?.[0]?.content?.parts?.[0]?.text
  if (!raw?.trim()) {
    throw new Error('Gemini returned an empty response.')
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
