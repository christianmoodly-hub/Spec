import {
  FILL_PAGE_CHANNEL,
  FILL_PAGE_KIND,
  type FillPageMessage,
} from '../messages'

export const FILL_TOKEN_TTL_MS = 15_000
export const FILL_RELAY_MS = 12_000
export const FILL_RELAY_EVERY_MS = 600
export const FILL_TOKENS_KEY = 'spesFillTokens'

export function makeFillPageMessage(token: string): FillPageMessage {
  return {
    channel: FILL_PAGE_CHANNEL,
    kind: FILL_PAGE_KIND,
    token,
  }
}

export function isFillPageMessage(data: unknown): data is FillPageMessage {
  if (!data || typeof data !== 'object') {
    return false
  }
  const value = data as Record<string, unknown>
  return (
    value.channel === FILL_PAGE_CHANNEL &&
    value.kind === FILL_PAGE_KIND &&
    typeof value.token === 'string' &&
    value.token.length > 0 &&
    value.token.length <= 80
  )
}

export function fillTokenFromEventData(data: unknown): string | null {
  return isFillPageMessage(data) ? data.token : null
}

export function pruneFillTokens(
  tokens: Record<string, number>,
  now: number,
): Record<string, number> {
  const next: Record<string, number> = {}
  for (const [token, expiresAt] of Object.entries(tokens)) {
    if (expiresAt > now) {
      next[token] = expiresAt
    }
  }
  return next
}
