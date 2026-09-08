interface DraftPanelProps {
  heading: string
  text: string
  generating: boolean
  busy: boolean
  error: string | null
  notice: string | null
  onChange: (value: string) => void
  onCopy: () => void
  onSave: () => void
  onClose: () => void
}

export function DraftPanel({
  heading,
  text,
  generating,
  busy,
  error,
  notice,
  onChange,
  onCopy,
  onSave,
  onClose,
}: DraftPanelProps) {
  return (
    <section className="draft-panel">
      <h2>{heading}</h2>
      {generating ? (
        <p className="hint">Generating…</p>
      ) : (
        <textarea
          value={text}
          onChange={(event) => onChange(event.target.value)}
          rows={14}
          disabled={busy}
        />
      )}
      {error ? <p className="error">{error}</p> : null}
      {notice ? <p className="hint">{notice}</p> : null}
      <div className="form-actions">
        <button
          type="button"
          onClick={onCopy}
          disabled={generating || busy || !text.trim()}
        >
          Copy to clipboard
        </button>
        <button
          type="button"
          onClick={onSave}
          disabled={generating || busy || !text.trim()}
        >
          {busy ? 'Saving…' : 'Save this version'}
        </button>
        <button
          type="button"
          className="secondary"
          onClick={onClose}
          disabled={busy}
        >
          Close
        </button>
      </div>
      <p className="hint">
        Nothing is stored until you save this version. Close discards the draft.
      </p>
    </section>
  )
}
