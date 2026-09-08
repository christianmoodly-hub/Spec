import { useEffect, useState } from 'react'
import type { User } from 'firebase/auth'
import {
  formatAuthError,
  isAuthWindow,
  signIn,
  signOut,
  subscribeToAuth,
} from '../lib/firebase'

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
    } catch (caught) {
      setError(formatAuthError(caught, 'Sign-out failed.'))
    } finally {
      setBusy(false)
    }
  }

  if (authWindow) {
    return (
      <main>
        <h1>Spes</h1>
        <p>{error ?? 'Opening Google sign-in…'}</p>
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
      <p>Tracker list will go here.</p>
      {error ? <p className="error">{error}</p> : null}
    </main>
  )
}
