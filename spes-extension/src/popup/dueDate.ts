export type DueFlag = 'overdue' | 'soon' | null

function parseDateOnly(value: string): Date | null {
  const day = value.slice(0, 10)
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day)
  if (!match) {
    return null
  }
  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]))
}

function startOfToday(): Date {
  const now = new Date()
  return new Date(now.getFullYear(), now.getMonth(), now.getDate())
}

export function dueFlag(dueDate: string | null): DueFlag {
  if (!dueDate) {
    return null
  }
  const due = parseDateOnly(dueDate)
  if (!due) {
    return null
  }
  const days = Math.round(
    (due.getTime() - startOfToday().getTime()) / 86_400_000,
  )
  if (days < 0) {
    return 'overdue'
  }
  if (days <= 3) {
    return 'soon'
  }
  return null
}

export function formatDue(dueDate: string | null): string | null {
  if (!dueDate) {
    return null
  }
  const due = parseDateOnly(dueDate)
  if (!due) {
    return dueDate.slice(0, 10)
  }
  return due.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

export function dueSortValue(dueDate: string | null): number {
  if (!dueDate) {
    return Number.POSITIVE_INFINITY
  }
  return parseDateOnly(dueDate)?.getTime() ?? Number.POSITIVE_INFINITY
}
