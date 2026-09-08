import { useEffect, useState, type FormEvent } from 'react'
import {
  formatAuthError,
  getProfile,
  signIn,
  subscribeToAuth,
  updateProfile,
  type User,
} from '../lib/firebase'

function bulletsToText(bullets: string[]): string {
  return bullets.join('\n')
}

function textToBullets(value: string): string[] {
  return value
    .split('\n')
    .map((line) => line.replace(/^\s*[-*•]\s*/, '').trim())
    .filter(Boolean)
}

export function App() {
  const [user, setUser] = useState<User | null>(null)
  const [ready, setReady] = useState(false)
  const [displayName, setDisplayName] = useState('')
  const [baseCV, setBaseCV] = useState('')
  const [bullets, setBullets] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [status, setStatus] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    return subscribeToAuth((next) => {
      setUser(next)
      setReady(true)
    })
  }, [])

  useEffect(() => {
    if (!user) {
      return
    }
    setError(null)
    void (async () => {
      try {
        const profile = await getProfile(user.uid)
        setDisplayName(
          profile?.displayName || user.displayName || user.email || '',
        )
        setBaseCV(profile?.baseCV ?? '')
        setBullets(bulletsToText(profile?.reusableBullets ?? []))
      } catch (caught) {
        setError(formatAuthError(caught, 'Could not load profile.'))
      }
    })()
  }, [user])

  async function onSignIn(): Promise<void> {
    setError(null)
    setBusy(true)
    try {
      await signIn()
    } catch (caught) {
      setError(formatAuthError(caught))
    } finally {
      setBusy(false)
    }
  }

  async function onSave(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault()
    if (!user) {
      return
    }
    setError(null)
    setStatus(null)
    setBusy(true)
    try {
      await updateProfile(user.uid, {
        displayName: displayName.trim(),
        baseCV: baseCV.trim(),
        reusableBullets: textToBullets(bullets),
      })
      setStatus('Saved.')
    } catch (caught) {
      setError(formatAuthError(caught, 'Could not save profile.'))
    } finally {
      setBusy(false)
    }
  }

  if (!ready) {
    return (
      <main>
        <h1>Spes options</h1>
        <p>Loading…</p>
      </main>
    )
  }

  if (!user) {
    return (
      <main>
        <h1>Spes options</h1>
        <p>Sign in to save your base CV and reusable bullets.</p>
        <button type="button" onClick={() => void onSignIn()} disabled={busy}>
          {busy ? 'Opening Google…' : 'Sign in with Google'}
        </button>
        {error ? <p className="error">{error}</p> : null}
      </main>
    )
  }

  return (
    <main>
      <h1>Spes options</h1>
      <p className="hint">
        Paste a base CV and optional bullets. Tailor CV and cover letter use
        this with each job description. Nothing is generated here.
      </p>
      <form onSubmit={(event) => void onSave(event)}>
        <label>
          Display name
          <input
            value={displayName}
            onChange={(event) => setDisplayName(event.target.value)}
          />
        </label>
        <label>
          Base CV
          <textarea
            value={baseCV}
            onChange={(event) => setBaseCV(event.target.value)}
            rows={16}
            required
          />
        </label>
        <label>
          Reusable bullets (one per line)
          <textarea
            value={bullets}
            onChange={(event) => setBullets(event.target.value)}
            rows={8}
          />
        </label>
        {error ? <p className="error">{error}</p> : null}
        {status ? <p className="status">{status}</p> : null}
        <button type="submit" disabled={busy}>
          {busy ? 'Saving…' : 'Save profile'}
        </button>
      </form>
    </main>
  )
}
