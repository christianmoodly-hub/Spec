/**
 * Due-date badge + notifications.
 *
 * MV3 service workers are short-lived and a poor place for Firebase Auth +
 * Firestore: auth often is not restored before an alarm handler finishes,
 * and Firestore's long-polling connection is torn down when the worker
 * sleeps. chrome.storage.local is the reliable SW store.
 *
 * The popup's live Firestore listener writes a slim cache of to-apply
 * items that have a due date. The worker reads that cache on alarms,
 * browser startup, and install. Data is as fresh as the last popup open
 * (or last snapshot while the popup was open).
 */

import type { Application } from '../types'
import { daysUntilDue, formatDue, todayIsoDate } from './dueDate'

export const REMINDER_ALARM = 'spes-due-check'
export const REMINDER_PERIOD_MINUTES = 180

const CACHE_KEY = 'spesReminderCache'
const NOTIFIED_KEY = 'spesReminderNotified'
const ICON_PATH = 'icon-128.png'

export interface ReminderItem {
  id: string
  title: string
  company: string
  dueDate: string
}

interface ReminderCache {
  uid: string
  updatedAt: string
  items: ReminderItem[]
}

type NotifiedMap = Record<string, string>

function reminderItemsFrom(applications: Application[]): ReminderItem[] {
  return applications
    .filter(
      (item) => item.status === 'to-apply' && daysUntilDue(item.dueDate) !== null,
    )
    .map((item) => ({
      id: item.id,
      title: item.title,
      company: item.company,
      dueDate: item.dueDate as string,
    }))
}

export async function syncReminderCache(
  uid: string,
  applications: Application[],
): Promise<void> {
  const cache: ReminderCache = {
    uid,
    updatedAt: new Date().toISOString(),
    items: reminderItemsFrom(applications),
  }
  await chrome.storage.local.set({ [CACHE_KEY]: cache })
  await runReminderPass()
}

export async function clearReminderCache(): Promise<void> {
  await chrome.storage.local.remove([CACHE_KEY, NOTIFIED_KEY])
  await chrome.action.setBadgeText({ text: '' })
}

async function readCache(): Promise<ReminderCache | null> {
  const result = await chrome.storage.local.get(CACHE_KEY)
  return (result[CACHE_KEY] as ReminderCache | undefined) ?? null
}

async function readNotified(): Promise<NotifiedMap> {
  const result = await chrome.storage.local.get(NOTIFIED_KEY)
  return (result[NOTIFIED_KEY] as NotifiedMap | undefined) ?? {}
}

function iconUrl(): string {
  return chrome.runtime.getURL(ICON_PATH)
}

async function setBadge(count: number): Promise<void> {
  await chrome.action.setBadgeBackgroundColor({ color: '#a40000' })
  await chrome.action.setBadgeText({
    text: count > 0 ? (count > 99 ? '99+' : String(count)) : '',
  })
}

function notifyMessage(item: ReminderItem, days: number): string {
  const due = formatDue(item.dueDate) ?? item.dueDate
  if (days < 0) {
    return `${item.title} at ${item.company} is overdue (${due}).`
  }
  return `${item.title} at ${item.company} is due today.`
}

async function notifyDue(item: ReminderItem, days: number): Promise<void> {
  await chrome.notifications.create(`spes-due-${item.id}`, {
    type: 'basic',
    iconUrl: iconUrl(),
    title: days < 0 ? 'Spes — overdue' : 'Spes — due today',
    message: notifyMessage(item, days),
    priority: 1,
  })
}

export async function runReminderPass(): Promise<void> {
  const cache = await readCache()
  const items = cache?.items ?? []
  const badgeCount = items.filter((item) => {
    const days = daysUntilDue(item.dueDate)
    return days !== null && days <= 3
  }).length
  await setBadge(badgeCount)

  const today = todayIsoDate()
  const notified = await readNotified()
  const nextNotified: NotifiedMap = {}

  for (const item of items) {
    const days = daysUntilDue(item.dueDate)
    if (days === null || days > 0) {
      continue
    }
    if (notified[item.id] === today) {
      nextNotified[item.id] = today
      continue
    }
    try {
      await notifyDue(item, days)
      nextNotified[item.id] = today
    } catch (error) {
      console.warn('[spes] notification failed', error)
    }
  }

  await chrome.storage.local.set({ [NOTIFIED_KEY]: nextNotified })
}

export async function scheduleReminderAlarms(): Promise<void> {
  await chrome.alarms.create(REMINDER_ALARM, {
    periodInMinutes: REMINDER_PERIOD_MINUTES,
    delayInMinutes: 1,
  })
}

export async function openTrackerFromNotification(): Promise<void> {
  try {
    await chrome.action.openPopup()
  } catch {
    const url = chrome.runtime.getURL('src/popup/index.html')
    await chrome.windows.create({
      url,
      type: 'popup',
      width: 420,
      height: 680,
      focused: true,
    })
  }
}
