import { useState, type FormEvent } from 'react'
import type { ApplicationStatus, NewApplication } from '../types'
import { APPLICATION_STATUSES } from '../types'
import { STATUS_LABELS } from './status'

interface ApplicationFormProps {
  initial?: Partial<NewApplication>
  heading?: string
  busy: boolean
  error: string | null
  onSave: (input: NewApplication) => Promise<void>
  onCancel: () => void
}

export function ApplicationForm({
  initial,
  heading,
  busy,
  error,
  onSave,
  onCancel,
}: ApplicationFormProps) {
  const [title, setTitle] = useState(initial?.title ?? '')
  const [company, setCompany] = useState(initial?.company ?? '')
  const [url, setUrl] = useState(initial?.url ?? '')
  const [description, setDescription] = useState(initial?.description ?? '')
  const [dueDate, setDueDate] = useState(initial?.dueDate?.slice(0, 10) ?? '')
  const [notes, setNotes] = useState(initial?.notes ?? '')
  const [status, setStatus] = useState<ApplicationStatus>(
    initial?.status ?? 'to-apply',
  )

  async function onSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault()
    const trimmedTitle = title.trim()
    const trimmedCompany = company.trim()
    if (!trimmedTitle || !trimmedCompany) {
      return
    }
    await onSave({
      title: trimmedTitle,
      company: trimmedCompany,
      url: url.trim(),
      description: description.trim(),
      dueDate: dueDate.trim() ? dueDate.trim() : null,
      notes: notes.trim(),
      status,
    })
  }

  return (
    <form className="app-form" onSubmit={(event) => void onSubmit(event)}>
      <h2>{heading ?? 'Add application'}</h2>
      <label>
        Title
        <input
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          required
          autoFocus
        />
      </label>
      <label>
        Company
        <input
          value={company}
          onChange={(event) => setCompany(event.target.value)}
          required
        />
      </label>
      <label>
        URL
        <input
          value={url}
          onChange={(event) => setUrl(event.target.value)}
          placeholder="https://"
        />
      </label>
      <label>
        Description
        <textarea
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          rows={3}
        />
      </label>
      <label>
        Due date
        <input
          type="date"
          value={dueDate}
          onChange={(event) => setDueDate(event.target.value)}
        />
      </label>
      <label>
        Status
        <select
          value={status}
          onChange={(event) =>
            setStatus(event.target.value as ApplicationStatus)
          }
        >
          {APPLICATION_STATUSES.map((value) => (
            <option key={value} value={value}>
              {STATUS_LABELS[value]}
            </option>
          ))}
        </select>
      </label>
      <label>
        Notes
        <textarea
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
          rows={3}
        />
      </label>
      {error ? <p className="error">{error}</p> : null}
      <div className="form-actions">
        <button type="submit" disabled={busy}>
          {busy ? 'Saving…' : 'Save'}
        </button>
        <button type="button" className="secondary" onClick={onCancel} disabled={busy}>
          Cancel
        </button>
      </div>
    </form>
  )
}
