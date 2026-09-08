import { parseDateOnly, todayIsoDate } from './dueDate'
import type { Streak } from '../types'

const EMPTY_STREAK: Streak = {
  currentStreak: 0,
  lastActivityDate: null,
  applicationsThisWeek: 0,
}

export function asDateKey(value: string | null | undefined): string | null {
  if (!value) {
    return null
  }
  const day = value.slice(0, 10)
  return parseDateOnly(day) ? day : null
}

function formatIsoDate(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${date.getFullYear()}-${month}-${day}`
}

export function shiftDateKey(dateKey: string, days: number): string | null {
  const date = parseDateOnly(dateKey)
  if (!date) {
    return null
  }
  date.setDate(date.getDate() + days)
  return formatIsoDate(date)
}

/** Monday of the local week containing dateKey, as YYYY-MM-DD. */
export function weekStartKey(dateKey: string): string | null {
  const date = parseDateOnly(dateKey)
  if (!date) {
    return null
  }
  const weekday = date.getDay()
  const offset = weekday === 0 ? -6 : 1 - weekday
  date.setDate(date.getDate() + offset)
  return formatIsoDate(date)
}

function sameWeek(left: string | null, right: string): boolean {
  if (!left) {
    return false
  }
  const a = weekStartKey(left)
  const b = weekStartKey(right)
  return a !== null && a === b
}

function streakIsAlive(lastActivityDate: string | null, today: string): boolean {
  if (!lastActivityDate) {
    return false
  }
  return (
    lastActivityDate === today || lastActivityDate === shiftDateKey(today, -1)
  )
}

/** Apply missed-day / new-week decay for display. Does not invent activity. */
export function viewStreak(
  stored: Streak | null,
  today = todayIsoDate(),
): Streak {
  if (!stored) {
    return { ...EMPTY_STREAK }
  }
  const last = asDateKey(stored.lastActivityDate)
  return {
    currentStreak: streakIsAlive(last, today) ? stored.currentStreak : 0,
    lastActivityDate: last,
    applicationsThisWeek: sameWeek(last, today)
      ? stored.applicationsThisWeek
      : 0,
  }
}

export function streakNeedsPersist(stored: Streak, viewed: Streak): boolean {
  return (
    stored.currentStreak !== viewed.currentStreak ||
    stored.applicationsThisWeek !== viewed.applicationsThisWeek
  )
}

/** First new application of a calendar day continues or restarts the streak. */
export function applyNewApplication(
  stored: Streak | null,
  today = todayIsoDate(),
): Streak {
  const last = asDateKey(stored?.lastActivityDate)
  const yesterday = shiftDateKey(today, -1)
  let currentStreak: number
  if (last === today) {
    currentStreak = Math.max(stored?.currentStreak ?? 1, 1)
  } else if (last !== null && last === yesterday) {
    currentStreak = (stored?.currentStreak ?? 0) + 1
  } else {
    currentStreak = 1
  }
  const applicationsThisWeek = sameWeek(last, today)
    ? (stored?.applicationsThisWeek ?? 0) + 1
    : 1
  return {
    currentStreak,
    lastActivityDate: today,
    applicationsThisWeek,
  }
}
