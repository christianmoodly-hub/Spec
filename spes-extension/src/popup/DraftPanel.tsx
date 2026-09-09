interface DraftPanelProps {
  heading: string
  text: string
  generating: boolean
  busy: boolean
  error: string | null
  notice: string | null
  onChange: (value: string) => void
  onCopy: () => void
  onDownloadWord: () => void
  onDownloadPdf: () => void
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
  onDownloadWord,
  onDownloadPdf,
  onSave,
  onClose,
}: DraftPanelProps) {
  const empty = generating || busy || !text.trim()
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
        <button type="button" onClick={onCopy} disabled={empty}>
          Copy to clipboard
        </button>
        <button type="button" onClick={onDownloadWord} disabled={empty}>
          Download Word
        </button>
        <button type="button" onClick={onDownloadPdf} disabled={empty}>
          Download PDF
        </button>
        <button type="button" onClick={onSave} disabled={empty}>
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
        Downloads use the text in the box now. Word is the safer ATS upload;
        PDF is fine for a person to read.
      </p>
    </section>
  )
}
