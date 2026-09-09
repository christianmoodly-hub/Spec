import { useState } from 'react'
import {
  PROFILE_ADDRESS_FIELDS,
  PROFILE_SCALAR_FIELDS,
} from '../lib/profileFields'
import type { ProfileStructuredFields } from '../types'

interface StructuredFieldsFormProps {
  value: ProfileStructuredFields
  onChange: (next: ProfileStructuredFields) => void
  disabled?: boolean
}

export function StructuredFieldsForm({
  value,
  onChange,
  disabled,
}: StructuredFieldsFormProps) {
  return (
    <div className="structured-form">
      <div className="field-grid">
        {PROFILE_SCALAR_FIELDS.map(([key, label]) => (
          <label key={key} className={key === 'workAuthorization' ? 'span-2' : undefined}>
            {label}
            <input
              value={value[key]}
              onChange={(event) =>
                onChange({ ...value, [key]: event.target.value })
              }
              disabled={disabled}
            />
          </label>
        ))}
      </div>
      <h3>Address</h3>
      <div className="field-grid">
        {PROFILE_ADDRESS_FIELDS.map(([key, label]) => (
          <label key={key} className={key === 'street' ? 'span-2' : undefined}>
            {label}
            <input
              value={value.address[key]}
              onChange={(event) =>
                onChange({
                  ...value,
                  address: { ...value.address, [key]: event.target.value },
                })
              }
              disabled={disabled}
            />
          </label>
        ))}
      </div>
      <MapFields
        title="EEO answers"
        addLabel="Add EEO answer"
        value={value.eeoAnswers}
        onChange={(eeoAnswers) => onChange({ ...value, eeoAnswers })}
        disabled={disabled}
      />
      <MapFields
        title="Custom fields"
        addLabel="Add custom field"
        value={value.customFields}
        onChange={(customFields) => onChange({ ...value, customFields })}
        disabled={disabled}
      />
    </div>
  )
}

function MapFields({
  title,
  addLabel,
  value,
  onChange,
  disabled,
}: {
  title: string
  addLabel: string
  value: Record<string, string>
  onChange: (next: Record<string, string>) => void
  disabled?: boolean
}) {
  const [newLabel, setNewLabel] = useState('')
  const [newValue, setNewValue] = useState('')

  function addPair(): void {
    const label = newLabel.trim()
    if (!label) {
      return
    }
    onChange({ ...value, [label]: newValue })
    setNewLabel('')
    setNewValue('')
  }

  const entries = Object.entries(value)

  return (
    <div className="map-fields">
      <h3>{title}</h3>
      {entries.length === 0 ? (
        <p className="hint">None yet.</p>
      ) : (
        <ul className="pair-list">
          {entries.map(([label, answer]) => (
            <PairRow
              key={label}
              title={title}
              label={label}
              answer={answer}
              disabled={disabled}
              onRename={(nextLabel, nextAnswer) => {
                const next = { ...value }
                delete next[label]
                if (nextLabel) {
                  next[nextLabel] = nextAnswer
                }
                onChange(next)
              }}
              onValue={(nextAnswer) =>
                onChange({ ...value, [label]: nextAnswer })
              }
              onRemove={() => {
                const next = { ...value }
                delete next[label]
                onChange(next)
              }}
            />
          ))}
        </ul>
      )}
      <div className="pair-add">
        <input
          placeholder="Label / question"
          value={newLabel}
          onChange={(event) => setNewLabel(event.target.value)}
          disabled={disabled}
        />
        <input
          placeholder="Answer"
          value={newValue}
          onChange={(event) => setNewValue(event.target.value)}
          disabled={disabled}
        />
        <button
          type="button"
          className="secondary"
          disabled={disabled || !newLabel.trim()}
          onClick={() => addPair()}
        >
          {addLabel}
        </button>
      </div>
    </div>
  )
}

function PairRow({
  title,
  label,
  answer,
  disabled,
  onRename,
  onValue,
  onRemove,
}: {
  title: string
  label: string
  answer: string
  disabled?: boolean
  onRename: (label: string, answer: string) => void
  onValue: (answer: string) => void
  onRemove: () => void
}) {
  const [draftLabel, setDraftLabel] = useState(label)

  return (
    <li>
      <input
        aria-label={`${title} label`}
        value={draftLabel}
        onChange={(event) => setDraftLabel(event.target.value)}
        onBlur={() => {
          const nextLabel = draftLabel.trim()
          if (nextLabel === label) {
            setDraftLabel(label)
            return
          }
          onRename(nextLabel, answer)
        }}
        disabled={disabled}
      />
      <input
        aria-label={`${title} value`}
        value={answer}
        onChange={(event) => onValue(event.target.value)}
        disabled={disabled}
      />
      <button
        type="button"
        className="secondary"
        disabled={disabled}
        onClick={onRemove}
      >
        Remove
      </button>
    </li>
  )
}
