import { useEffect, useMemo, useState } from 'react'
import {
  addApplication,
  deleteApplication,
  formatAuthError,
  subscribeToApplications,
  syncOwnStreakDecay,
  updateApplication,
  type User,
} from '../lib/firebase'
import { syncReminderCache } from '../lib/reminders'
import {
  clearCaptureDraft,
  readCaptureDraft,
} from '../lib/capture'
import {
  MSG_INJECT_FALLBACK,
  MSG_PARSE_PAGE,
  type SpesResponse,
} from '../lib/messages'
import type { Application, ApplicationStatus, NewApplication } from '../types'
import { APPLICATION_STATUSES } from '../types'
import { ApplicationForm } from './ApplicationForm'
import { dueFlag, dueSortValue, formatDue } from './dueDate'
import { STATUS_LABELS } from './status'
import { StreakPanel } from './StreakPanel'

type Filter = 'all' | ApplicationStatus
type View =
  | { kind: 'list' }
  | { kind: 'streak' }
  | { kind: 'add'; initial?: Partial<NewApplication>; heading: string }
  | { kind: 'edit'; item: Application }

interface TrackerProps {
  user: User
}

function sortApplications(items: Application[]): Application[] {
  return [...items].sort((left, right) => {
    const dueDiff = dueSortValue(left.dueDate) - dueSortValue(right.dueDate)
    if (dueDiff !== 0) {
      return dueDiff
    }
    return right.createdAt.localeCompare(left.createdAt)
  })
}

function openUrl(url: string): void {
  if (!url) {
    return
  }
  const href = /^https?:\/\//i.test(url) ? url : `https://${url}`
  void chrome.tabs.create({ url: href })
}

export function Tracker({ user }: TrackerProps) {
  const [items, setItems] = useState<Application[]>([])
  const [loaded, setLoaded] = useState(false)
  const [filter, setFilter] = useState<Filter>('all')
  const [view, setView] = useState<View>({ kind: 'list' })
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    setLoaded(false)
    void syncOwnStreakDecay().catch(() => undefined)
    return subscribeToApplications(
      user.uid,
      (next) => {
        setItems(next)
        setLoaded(true)
        void syncReminderCache(user.uid, next)
      },
      (caught) => {
        setError(formatAuthError(caught, 'Could not load applications.'))
        setLoaded(true)
      },
    )
  }, [user.uid])

  useEffect(() => {
    void readCaptureDraft().then((draft) => {
      if (!draft) {
        return
      }
      setView({
        kind: 'add',
        initial: draft,
        heading: 'Review extracted job',
      })
    })
  }, [])

  const visible = useMemo(() => {
    const filtered =
      filter === 'all' ? items : items.filter((item) => item.status === filter)
    return sortApplications(filtered)
  }, [filter, items])

  const grouped = useMemo(() => {
    return APPLICATION_STATUSES.map((status) => ({
      status,
      items: visible.filter((item) => item.status === status),
    })).filter((group) => group.items.length > 0)
  }, [visible])

  async function saveNew(input: NewApplication): Promise<void> {
    setBusy(true)
    setError(null)
    try {
      await addApplication(input)
      await clearCaptureDraft()
      setView({ kind: 'list' })
    } catch (caught) {
      setError(formatAuthError(caught, 'Could not save application.'))
    } finally {
      setBusy(false)
    }
  }

  async function saveEdit(
    appId: string,
    input: NewApplication,
  ): Promise<void> {
    setBusy(true)
    setError(null)
    try {
      await updateApplication(appId, input)
      setView({ kind: 'list' })
    } catch (caught) {
      setError(formatAuthError(caught, 'Could not update application.'))
    } finally {
      setBusy(false)
    }
  }

  async function changeStatus(
    appId: string,
    status: ApplicationStatus,
  ): Promise<void> {
    setError(null)
    try {
      await updateApplication(appId, { status })
    } catch (caught) {
      setError(formatAuthError(caught, 'Could not update status.'))
    }
  }

  async function remove(item: Application): Promise<void> {
    const confirmed = window.confirm(`Delete “${item.title}” at ${item.company}?`)
    if (!confirmed) {
      return
    }
    setError(null)
    try {
      await deleteApplication(item.id)
    } catch (caught) {
      setError(formatAuthError(caught, 'Could not delete application.'))
    }
  }

  async function goBackToList(): Promise<void> {
    setError(null)
    await clearCaptureDraft()
    setView({ kind: 'list' })
  }

  async function captureCurrentPage(): Promise<void> {
    setError(null)
    const [tab] = await chrome.tabs.query({
      active: true,
      lastFocusedWindow: true,
    })
    if (!tab?.id) {
      setError('No active tab to capture.')
      return
    }
    const tabUrl = tab.url ?? ''
    const isJobSite =
      /linkedin\.com/i.test(tabUrl) || /indeed\.com/i.test(tabUrl)
    if (isJobSite) {
      try {
        const response = (await chrome.tabs.sendMessage(tab.id, {
          type: MSG_PARSE_PAGE,
        })) as SpesResponse
        if (response?.ok && response.draft) {
          setView({
            kind: 'add',
            initial: response.draft,
            heading: 'Review extracted job',
          })
          return
        }
      } catch {
        // Fall through to generic injection if the page script is missing.
      }
    }
    const injected = (await chrome.runtime.sendMessage({
      type: MSG_INJECT_FALLBACK,
      tabId: tab.id,
    })) as SpesResponse
    if (!injected?.ok) {
      setError(injected?.error ?? 'Could not inject the capture panel.')
      return
    }
    window.close()
  }

  if (view.kind === 'add') {
    return (
      <ApplicationForm
        heading={view.heading}
        initial={view.initial}
        busy={busy}
        error={error}
        onSave={saveNew}
        onCancel={() => void goBackToList()}
      />
    )
  }

  if (view.kind === 'edit') {
    return (
      <ApplicationForm
        key={view.item.id}
        heading="Edit application"
        initial={view.item}
        busy={busy}
        error={error}
        onSave={(input) => saveEdit(view.item.id, input)}
        onCancel={() => void goBackToList()}
      />
    )
  }

  return (
    <section className="tracker">
      <div className="tabs" role="tablist" aria-label="Popup sections">
        <button
          type="button"
          role="tab"
          aria-selected={view.kind === 'list'}
          className={view.kind === 'list' ? 'active' : undefined}
          onClick={() => setView({ kind: 'list' })}
        >
          Applications
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={view.kind === 'streak'}
          className={view.kind === 'streak' ? 'active' : undefined}
          onClick={() => setView({ kind: 'streak' })}
        >
          Streak
        </button>
      </div>
      {view.kind === 'streak' ? <StreakPanel user={user} /> : null}
      {view.kind === 'list' ? (
        <>
      <div className="tracker-toolbar">
        <button
          type="button"
          onClick={() =>
            setView({ kind: 'add', heading: 'Add application' })
          }
        >
          Add application
        </button>
        <button
          type="button"
          className="secondary"
          onClick={() => void captureCurrentPage()}
        >
          Capture this page
        </button>
      </div>
      <div className="filters" role="tablist" aria-label="Filter by status">
        <button
          type="button"
          className={filter === 'all' ? 'active' : undefined}
          onClick={() => setFilter('all')}
        >
          All
        </button>
        {APPLICATION_STATUSES.map((status) => (
          <button
            key={status}
            type="button"
            className={filter === status ? 'active' : undefined}
            onClick={() => setFilter(status)}
          >
            {STATUS_LABELS[status]}
          </button>
        ))}
      </div>
      {error ? <p className="error">{error}</p> : null}
      {!loaded ? <p className="hint">Loading applications…</p> : null}
      {loaded && visible.length === 0 ? (
        <p className="hint">No applications yet. Add one manually.</p>
      ) : null}
      {filter === 'all'
        ? grouped.map((group) => (
            <div key={group.status} className="status-group">
              <h2>{STATUS_LABELS[group.status]}</h2>
              <ul>
                {group.items.map((item) => (
                  <ApplicationRow
                    key={item.id}
                    item={item}
                    onStatus={(status) => void changeStatus(item.id, status)}
                    onEdit={() => setView({ kind: 'edit', item })}
                    onDelete={() => void remove(item)}
                    onOpenUrl={() => openUrl(item.url)}
                  />
                ))}
              </ul>
            </div>
          ))
        : (
            <ul>
              {visible.map((item) => (
                <ApplicationRow
                  key={item.id}
                  item={item}
                  onStatus={(status) => void changeStatus(item.id, status)}
                  onEdit={() => setView({ kind: 'edit', item })}
                  onDelete={() => void remove(item)}
                  onOpenUrl={() => openUrl(item.url)}
                />
              ))}
            </ul>
          )}
        </>
      ) : null}
    </section>
  )
}

function ApplicationRow({
  item,
  onStatus,
  onEdit,
  onDelete,
  onOpenUrl,
}: {
  item: Application
  onStatus: (status: ApplicationStatus) => void
  onEdit: () => void
  onDelete: () => void
  onOpenUrl: () => void
}) {
  const flag = dueFlag(item.dueDate)
  const dueLabel = formatDue(item.dueDate)

  return (
    <li className="app-row">
      <div className="app-row-top">
        {item.url ? (
          <button type="button" className="title-link" onClick={onOpenUrl}>
            {item.title}
          </button>
        ) : (
          <strong>{item.title}</strong>
        )}
        <select
          aria-label={`Status for ${item.title}`}
          value={item.status}
          onChange={(event) =>
            onStatus(event.target.value as ApplicationStatus)
          }
        >
          {APPLICATION_STATUSES.map((status) => (
            <option key={status} value={status}>
              {STATUS_LABELS[status]}
            </option>
          ))}
        </select>
      </div>
      <p className="app-meta">
        <span>{item.company}</span>
        {dueLabel ? (
          <span className={flag ? `due ${flag}` : 'due'}>
            {flag === 'overdue' ? 'Overdue · ' : flag === 'soon' ? 'Due soon · ' : ''}
            {dueLabel}
          </span>
        ) : null}
      </p>
      <div className="row-actions">
        <button type="button" className="secondary" onClick={onEdit}>
          Edit
        </button>
        <button type="button" className="secondary danger" onClick={onDelete}>
          Delete
        </button>
      </div>
    </li>
  )
}
