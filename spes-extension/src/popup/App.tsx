import { useEffect, useState } from 'react'
import {
  formatAuthError,
  getGoogleSignInSetup,
  isAuthWindow,
  signIn,
  signOut,
  subscribeToAuth,
  type User,
} from '../lib/firebase'
import { clearReminderCache } from '../lib/reminders'
import { Tracker } from './Tracker'

let authWindowSignInStarted = false

export function App() {
  const [user, setUser] = useState<User | null>(null)
  const [ready, setReady] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const authWindow = isAuthWindow()

  useEffect(() => {
    return subscribeToAuth((next) => {
      setUser(next)
      setReady(true)
    })
  }, [])

  useEffect(() => {
    if (!authWindow || authWindowSignInStarted) {
      return
    }
    authWindowSignInStarted = true
    void (async () => {
      try {
        await signIn()
        window.close()
      } catch (caught) {
        setError(formatAuthError(caught))
      }
    })()
  }, [authWindow])

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

  async function onSignOut(): Promise<void> {
    setError(null)
    setBusy(true)
    try {
      await signOut()
      await clearReminderCache()
    } catch (caught) {
      setError(formatAuthError(caught, 'Sign-out failed.'))
    } finally {
      setBusy(false)
    }
  }

  if (authWindow) {
    const setup = getGoogleSignInSetup()
    return (
      <main>
        <h1>Spes</h1>
        <p>{error ?? 'Opening Google sign-in…'}</p>
        {error ? (
          <>
            <p className="hint">Send these to your partner:</p>
            <p className="setup-line">
              Firebase domain
              <code>chrome-extension://{setup.extensionId}</code>
            </p>
            <p className="setup-line">
              Google Cloud redirect URI
              <code>{setup.redirectUri}</code>
            </p>
          </>
        ) : null}
      </main>
    )
  }

  if (!ready) {
    return (
      <main>
        <h1>Spes</h1>
        <p>Loading…</p>
      </main>
    )
  }

  if (!user) {
    const setup = getGoogleSignInSetup()
    return (
      <main>
        <h1>Spes</h1>
        <p>Sign in to track applications.</p>
        <button type="button" onClick={() => void onSignIn()} disabled={busy}>
          {busy ? 'Opening Google…' : 'Sign in with Google'}
        </button>
        <p className="hint">
          A window will open for Google. Reopen this popup after you finish.
        </p>
        {error ? <p className="error">{error}</p> : null}
        <p className="hint">If Google says “invalid request”, send these to your partner:</p>
        <p className="setup-line">
          Firebase domain
          <code>chrome-extension://{setup.extensionId}</code>
        </p>
        <p className="setup-line">
          Google Cloud redirect URI
          <code>{setup.redirectUri}</code>
        </p>
        <button
          type="button"
          className="secondary"
          onClick={() =>
            void navigator.clipboard.writeText(
              `chrome-extension://${setup.extensionId}\n${setup.redirectUri}`,
            )
          }
        >
          Copy both
        </button>
      </main>
    )
  }

  const label = user.displayName ?? user.email ?? 'Signed in'

  return (
    <main>
      <header>
        <h1>Spes</h1>
        <button type="button" onClick={() => void onSignOut()} disabled={busy}>
          Sign out
        </button>
      </header>
      <p className="user">{label}</p>
      <Tracker user={user} />
      {error ? <p className="error">{error}</p> : null}
    </main>
  )
}
