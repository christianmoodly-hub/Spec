/**
 * Gemini extraction — used from the background worker only.
 * Do not import this module from content scripts (the API key is inlined
 * at build time and must not be injected into LinkedIn/Indeed pages).
 */

export interface ExtractedJob {
  title: string
  company: string
  description: string
  dueDate: string | null
}

const SYSTEM_PROMPT = `You extract job-application fields from messy webpage text.
Return ONLY valid JSON with exactly these keys:
- title: string (job title)
- company: string (hiring company)
- description: string (concise role summary, 1-8 sentences, plain text)
- dueDate: string or null (ISO date YYYY-MM-DD if a deadline or closing date is clearly stated, otherwise null)

No markdown, no commentary, no extra keys. If a field is unknown, use an empty string (or null for dueDate).`

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

export async function extractJobFromText(
  pageText: string,
  pageUrl: string,
): Promise<ExtractedJob> {
  const text = pageText.trim().slice(0, 24_000)
  if (!text) {
    throw new Error('No page text to extract from.')
  }

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName()}:generateContent?key=${encodeURIComponent(apiKey())}`
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
      contents: [
        {
          role: 'user',
          parts: [
            {
              text: `Page URL: ${pageUrl}\n\nPage text:\n${text}`,
            },
          ],
        },
      ],
      generationConfig: {
        temperature: 0.2,
        responseMimeType: 'application/json',
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
  if (!raw) {
    throw new Error('Gemini returned an empty response.')
  }
  return asExtractedJob(parseModelJson(raw))
}
