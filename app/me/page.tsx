'use client'
import Link from 'next/link'
import { useEffect, useState } from 'react'
import { countryName, countryNames } from '@/lib/country'
import { userHue, userInk } from '@/lib/sky'
import { Arrow } from '../icons'

type Stamp = { country: string; count: number; first: string }
type Me = { handle: string; country: string | null; stamps?: Stamp[] }
const options = countryNames()

export default function MePage() {
  const [me, setMe] = useState<Me | null | undefined>(undefined)
  const [status, setStatus] = useState('')

  useEffect(() => {
    fetch('/api/me').then(async (r) => setMe(r.ok ? await r.json() : null))
  }, [])

  if (me === undefined) return <main className="sheet"><p className="status">Loading your ticket…</p></main>
  if (me === null)
    return (
      <main className="sheet">
        <h1 className="title me-title" data-ink="Not boarded">Not boarded</h1>
        <p className="lede"><Link className="tag" href="/">Back to the map and log in</Link></p>
      </main>
    )

  const save = async (value: string) => {
    const country = value || null
    const r = await fetch('/api/me', { method: 'POST', body: JSON.stringify({ country }) })
    if (r.ok) setMe({ ...me, country })
    setStatus(r.ok ? 'Saved. Your next planes take off from here.' : 'Couldn’t save that. Try again in a moment.')
  }

  const handle = me.handle ? `@${me.handle}` : 'You’re in'
  return (
    <main className="sheet">
      <h1 className="title me-title" data-ink={handle}>{handle}</h1>
      <div className="form">
        <label htmlFor="country">Your planes take off from</label>
        <select id="country" value={me.country ?? ''} onChange={(e) => save(e.target.value)}>
          <option value="">Antarctica (somewhere unknown)</option>
          {options.map(([code, name]) => <option key={code} value={code}>{name}</option>)}
        </select>
        <p className="status" role="status">{status}</p>
      </div>
      <Passport handle={me.handle} stamps={me.stamps ?? []} />
      <p className="lede"><Link className="tag" href="/">See your planes on the map <Arrow /></Link></p>
    </main>
  )
}

// паспорт: штамп за каждую страну, куда долетел твой самолётик, — твоей краской
function Passport({ handle, stamps }: { handle: string; stamps: Stamp[] }) {
  const ink = { '--ink': userInk(handle ?? '') } as React.CSSProperties
  return (
    <section className="passport" style={ink} aria-labelledby="passport-title">
      <h2 id="passport-title">Passport <span>{stamps.length} {stamps.length === 1 ? 'country' : 'countries'}</span></h2>
      {stamps.length ? (
        <ol className="stamps">
          {stamps.map((st) => (
            // наклон штампа постоянный для страны — как будто ставили от руки
            <li key={st.country} className="stamp-mark" style={{ rotate: `${(userHue(st.country) % 15) - 7}deg` } as React.CSSProperties}>
              <b>{countryName(st.country)}</b>
              <span>{new Date(st.first).toLocaleDateString('en', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
              <span className="times">×{st.count}</span>
            </li>
          ))}
        </ol>
      ) : (
        <p className="empty">No stamps yet. Reply to someone abroad on X and your first plane will stamp it here.</p>
      )}
    </section>
  )
}
