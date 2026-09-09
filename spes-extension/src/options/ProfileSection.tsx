import { useEffect, useState } from 'react'
import { formatAuthError, updateProfile } from '../lib/firebase'
import {
  MSG_PARSE_PROFILE,
  type SpesResponse,
} from '../lib/messages'
import {
  applyReviewRows,
  asStructuredFields,
  buildReviewRows,
  cloneStructuredFields,
  type ReviewRow,
} from '../lib/profileFields'
import type { ProfileStructuredFields } from '../types'
import { StructuredFieldsForm } from './StructuredFieldsForm'

interface ProfileSectionProps {
  uid: string
  initialRawDump: string
  initialStructuredFields: ProfileStructuredFields
  initialLastParsed: string | null
}

export function ProfileSection({
  uid,
  initialRawDump,
  initialStructuredFields,
  initialLastParsed,
}: ProfileSectionProps) {
  const [rawDump, setRawDump] = useState(initialRawDump)
  const [fields, setFields] = useState(() =>
    cloneStructuredFields(initialStructuredFields),
  )
  const [lastParsedFromDump, setLastParsedFromDump] = useState(
    initialLastParsed,
  )
  const [reviewRows, setReviewRows] = useState<ReviewRow[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [status, setStatus] = useState<string | null>(null)
  const [parsing, setParsing] = useState(false)
  const [saving, setSaving] = useState(false)
  const busy = parsing || saving

  useEffect(() => {
    setRawDump(initialRawDump)
    setFields(cloneStructuredFields(initialStructuredFields))
    setLastParsedFromDump(initialLastParsed)
    setReviewRows(null)
  }, [initialRawDump, initialStructuredFields, initialLastParsed])

  async function onParse(): Promise<void> {
    setError(null)
    setStatus(null)
    if (!rawDump.trim()) {
      setError('Paste some notes about yourself first.')
      return
    }
    setParsing(true)
    try {
      const response = (await chrome.runtime.sendMessage({
        type: MSG_PARSE_PROFILE,
        rawDump,
      })) as SpesResponse
      if (!response?.ok || !response.structuredFields) {
        setError(
          !response || response.ok
            ? 'Parse did not return fields.'
            : response.error,
        )
        return
      }
      const rows = buildReviewRows(fields, response.structuredFields)
      if (rows.length === 0) {
        setReviewRows(null)
        setStatus('Parse found nothing new to apply.')
        return
      }
      setReviewRows(rows)
      setStatus('Review the parsed fields, then apply the ones you want.')
    } catch (caught) {
      setError(formatAuthError(caught, 'Could not parse notes.'))
    } finally {
      setParsing(false)
    }
  }

  function onApplyReview(): void {
    if (!reviewRows) {
      return
    }
    setFields(applyReviewRows(fields, reviewRows))
    setLastParsedFromDump(new Date().toISOString())
    setReviewRows(null)
    setStatus('Applied selected fields. Save to keep them.')
  }

  async function onSave(): Promise<void> {
    setError(null)
    setStatus(null)
    setSaving(true)
    try {
      await updateProfile(uid, {
        rawDump,
        structuredFields: asStructuredFields(fields),
        ...(lastParsedFromDump ? { lastParsedFromDump } : {}),
      })
      setStatus('Saved profile fields.')
    } catch (caught) {
      setError(formatAuthError(caught, 'Could not save profile fields.'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="profile-section">
      <h2>Profile</h2>
      <p className="hint">
        Paste anything about yourself, parse it into fields, then review before
        it is saved. You can also edit fields directly.
      </p>
      <label>
        Notes about you
        <textarea
          value={rawDump}
          onChange={(event) => setRawDump(event.target.value)}
          rows={12}
          disabled={busy}
          placeholder="Background, skills, work history, common application answers…"
        />
      </label>
      <div className="row-actions">
        <button
          type="button"
          onClick={() => void onParse()}
          disabled={busy || !rawDump.trim()}
        >
          {parsing ? 'Parsing…' : 'Parse into fields'}
        </button>
      </div>
      {reviewRows ? (
        <ParseReview
          rows={reviewRows}
          disabled={busy}
          onChange={setReviewRows}
          onApply={onApplyReview}
          onDismiss={() => setReviewRows(null)}
        />
      ) : null}
      <h3>Structured fields</h3>
      <StructuredFieldsForm
        value={fields}
        onChange={setFields}
        disabled={busy}
      />
      {error ? <p className="error">{error}</p> : null}
      {status ? <p className="status">{status}</p> : null}
      {lastParsedFromDump ? (
        <p className="hint">
          Last parsed {new Date(lastParsedFromDump).toLocaleString()}
        </p>
      ) : null}
      <button type="button" onClick={() => void onSave()} disabled={busy}>
        {saving ? 'Saving…' : 'Save profile fields'}
      </button>
    </section>
  )
}

function ParseReview({
  rows,
  disabled,
  onChange,
  onApply,
  onDismiss,
}: {
  rows: ReviewRow[]
  disabled: boolean
  onChange: (rows: ReviewRow[]) => void
  onApply: () => void
  onDismiss: () => void
}) {
  const selected = rows.filter((row) => row.useProposed).length

  function patchRow(id: string, patch: Partial<ReviewRow>): void {
    onChange(rows.map((row) => (row.id === id ? { ...row, ...patch } : row)))
  }

  return (
    <div className="parse-review">
      <h3>Review parsed fields</h3>
      <p className="hint">
        Existing values are kept unless you choose the parsed version. Empty
        fields default to the parsed value. Edit a proposal before applying.
      </p>
      <ul className="review-list">
        {rows.map((row) => (
          <li key={row.id} className="review-row">
            <strong>{row.label}</strong>
            <div className="review-sides">
              <div>
                <span className="review-caption">Current</span>
                <p>{row.current || '(empty)'}</p>
              </div>
              <div>
                <span className="review-caption">Parsed</span>
                <textarea
                  rows={2}
                  value={row.proposed}
                  disabled={disabled}
                  onChange={(event) =>
                    patchRow(row.id, { proposed: event.target.value })
                  }
                />
              </div>
            </div>
            <div className="review-choice">
              <label className="inline">
                <input
                  type="radio"
                  name={`review-${row.id}`}
                  checked={!row.useProposed}
                  disabled={disabled || !row.current}
                  onChange={() => patchRow(row.id, { useProposed: false })}
                />
                Keep current
              </label>
              <label className="inline">
                <input
                  type="radio"
                  name={`review-${row.id}`}
                  checked={row.useProposed}
                  disabled={disabled}
                  onChange={() => patchRow(row.id, { useProposed: true })}
                />
                Use parsed
              </label>
            </div>
          </li>
        ))}
      </ul>
      <div className="row-actions">
        <button type="button" onClick={onApply} disabled={disabled || selected === 0}>
          Apply {selected} selected
        </button>
        <button
          type="button"
          className="secondary"
          onClick={onDismiss}
          disabled={disabled}
        >
          Dismiss
        </button>
      </div>
    </div>
  )
}
