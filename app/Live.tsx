'use client'
import { useEffect, useState } from 'react'
import { Arrow } from './icons'

const STATS = process.env.NEXT_PUBLIC_STATS_URL
const fmt = (n: number) => n.toLocaleString('en-US')

// «сейчас смотрят / за сегодня»: пульс, пока вкладка на экране
export default function Live() {
  const [n, setN] = useState<{ online: number; today: number } | null>(null)

  useEffect(() => {
    let id: string
    try {
      id = localStorage.pp_visitor ??= crypto.randomUUID()
    } catch {
      id = crypto.randomUUID()
    }
    const beat = () => {
      if (document.visibilityState !== 'visible') return
      fetch('/api/live', { method: 'POST', body: JSON.stringify({ id }) })
        .then((r) => (r.ok ? r.json() : null))
        .then((j) => j && setN(j))
        .catch(() => {})
    }
    beat()
    const t = setInterval(beat, 30_000)
    document.addEventListener('visibilitychange', beat)
    return () => {
      clearInterval(t)
      document.removeEventListener('visibilitychange', beat)
    }
  }, [])

  if (!n) return null
  return (
    <p className="live">
      <span className="live-dot" aria-hidden="true" />
      <span><b>{fmt(n.online)}</b> online</span>
      <span className="live-sep" aria-hidden="true">·</span>
      <span><b>{fmt(n.today)}</b> <span className="wide">visitors </span>today</span>
      {STATS && <a href={STATS} target="_blank" rel="noopener">stats <Arrow /></a>}
    </p>
  )
}
