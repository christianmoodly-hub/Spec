import { useEffect, useMemo, useState } from 'react'
import {
  formatAuthError,
  subscribeToStreaks,
  type User,
} from '../lib/firebase'
import { viewStreak } from '../lib/streak'
import type { Streak } from '../types'

interface StreakPanelProps {
  user: User
}

export function StreakPanel({ user }: StreakPanelProps) {
  const [byUid, setByUid] = useState<Record<string, Streak>>({})
  const [loaded, setLoaded] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setLoaded(false)
    return subscribeToStreaks(
      (next) => {
        setByUid(next)
        setLoaded(true)
      },
      (caught) => {
        setError(formatAuthError(caught, 'Could not load streaks.'))
        setLoaded(true)
      },
    )
  }, [])

  const mine = useMemo(
    () => viewStreak(byUid[user.uid] ?? null),
    [byUid, user.uid],
  )
  const others = useMemo(
    () =>
      Object.entries(byUid)
        .filter(([uid]) => uid !== user.uid)
        .map(([uid, stored]) => ({ uid, streak: viewStreak(stored) })),
    [byUid, user.uid],
  )

  return (
    <section className="streaks">
      {error ? <p className="error">{error}</p> : null}
      {!loaded ? <p className="hint">Loading streaks…</p> : null}
      <div className="streak-grid">
        <StreakCard label="You" streak={mine} />
        {others.length > 0 ? (
          others.map((other) => (
            <StreakCard key={other.uid} label="Partner" streak={other.streak} />
          ))
        ) : (
          <StreakCard label="Partner" streak={viewStreak(null)} />
        )}
      </div>
      <p className="hint">A missed day resets the streak.</p>
    </section>
  )
}

function StreakCard({ label, streak }: { label: string; streak: Streak }) {
  const days = streak.currentStreak
  const week = streak.applicationsThisWeek
  return (
    <article className="streak-card">
      <h2>{label}</h2>
      <p className="streak-stat">
        <strong>{days}</strong>
        {days === 1 ? ' day' : ' days'}
      </p>
      <p className="streak-week">
        {week} {week === 1 ? 'application' : 'applications'} this week
      </p>
    </article>
  )
}
