'use client'
import Link from 'next/link'
import { useEffect, useState } from 'react'
import { countryNames } from '@/lib/country'

type Me = { handle: string; country: string | null }
const options = countryNames()

export default function MePage() {
  const [me, setMe] = useState<Me | null | undefined>(undefined)
  const [status, setStatus] = useState('')

  useEffect(() => {
    fetch('/api/me').then(async (r) => setMe(r.ok ? await r.json() : null))
  }, [])

  if (me === undefined) return <main>Loading…</main>
  if (me === null) return <main><Link className="btn" href="/">Log in first</Link></main>

  const save = async (value: string) => {
    const country = value || null
    const r = await fetch('/api/me', { method: 'POST', body: JSON.stringify({ country }) })
    if (r.ok) setMe({ ...me, country })
    setStatus(r.ok ? 'Saved ✈' : 'Could not save, try again')
  }

  return (
    <main>
      <h1>@{me.handle}</h1>
      <p>
        <label>
          Your planes take off from{' '}
          <select value={me.country ?? ''} onChange={(e) => save(e.target.value)}>
            <option value="">☁ the fog (unknown)</option>
            {options.map(([code, name]) => <option key={code} value={code}>{name}</option>)}
          </select>
        </label>
      </p>
      <p role="status">{status}</p>
      <p><Link href="/">← back to the map</Link></p>
    </main>
  )
}
