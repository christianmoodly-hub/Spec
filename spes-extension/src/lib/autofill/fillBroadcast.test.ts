import { describe, expect, it } from 'vitest'
import {
  FILL_PAGE_CHANNEL,
  FILL_PAGE_KIND,
} from '../messages'
import {
  fillTokenFromEventData,
  isFillPageMessage,
  makeFillPageMessage,
  pruneFillTokens,
} from './fillBroadcast'

describe('fill broadcast messages', () => {
  it('accepts a well-formed page message', () => {
    const message = makeFillPageMessage('abc-token')
    expect(isFillPageMessage(message)).toBe(true)
    expect(fillTokenFromEventData(message)).toBe('abc-token')
  })

  it('rejects spoofed or unrelated window messages', () => {
    expect(isFillPageMessage(null)).toBe(false)
    expect(isFillPageMessage({ type: 'run-fill', token: 'x' })).toBe(false)
    expect(
      isFillPageMessage({
        channel: FILL_PAGE_CHANNEL,
        kind: FILL_PAGE_KIND,
        token: '',
      }),
    ).toBe(false)
    expect(
      isFillPageMessage({
        channel: FILL_PAGE_CHANNEL,
        kind: FILL_PAGE_KIND,
        token: 'x'.repeat(81),
      }),
    ).toBe(false)
    expect(fillTokenFromEventData({ channel: 'other', token: 'x' })).toBeNull()
  })

  it('drops expired fill tokens', () => {
    const pruned = pruneFillTokens(
      { live: 200, stale: 50 },
      100,
    )
    expect(pruned).toEqual({ live: 200 })
  })
})
