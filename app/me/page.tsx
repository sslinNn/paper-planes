'use client'
import Link from 'next/link'
import posthog from 'posthog-js'
import { useEffect, useState } from 'react'
import { countryNames } from '@/lib/country'
import Passport, { type Stamp } from './Passport'
import Support from './Support'
import type { PlaneModel } from '@/lib/patrons'
import { Arrow } from '../icons'

type Me = {
  handle: string; country: string | null; image?: string | null; stamps?: Stamp[]
  patronSince?: string | null; plane?: PlaneModel; donations?: boolean; spot?: [number, number] | null
}
const options = countryNames()

export default function MePage() {
  const [me, setMe] = useState<Me | null | undefined>(undefined)
  const [status, setStatus] = useState('')

  useEffect(() => {
    const thanks = new URLSearchParams(location.search).has('thanks')
    const load = () => fetch(thanks ? '/api/me?sync=1' : '/api/me').then(async (r) => (r.ok ? ((await r.json()) as Me) : null))
    // вернулись с оплаты: вебхук приходит не мгновенно — проверяем минуту, пока не появится статус донатера
    load().then((m) => {
      setMe(m)
      // склеиваем анонимные визиты с X-хэндлом, чтобы в PostHog видеть путь человека целиком
      if (m?.handle) posthog.identify(m.handle, { handle: m.handle, country: m.country, patron: !!m.patronSince })
      if (thanks) posthog.capture('donation_returned', { outcome: 'paid', patron: !!m?.patronSince })
      if (thanks && !m?.patronSince) setStatus('Thank you! Your gold arrives as soon as the payment clears.')
    })
    if (!thanks) return
    let tries = 0
    const t = setInterval(async () => {
      const m = await load()
      if (m?.patronSince || ++tries > 12) {
        clearInterval(t)
        if (m) setMe(m)
      }
    }, 5000)
    return () => clearInterval(t)
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
    if (r.ok) setMe({ ...me, country, spot: null }) // новая страна — старая точка сброшена
    if (r.ok) posthog.capture('country_set', { country })
    setStatus(r.ok ? 'Saved. Your next planes take off from here.' : 'Couldn’t save that. Try again in a moment.')
  }

  const setPlane = async (plane: PlaneModel) => {
    const r = await fetch('/api/me', { method: 'POST', body: JSON.stringify({ plane }) })
    if (r.ok) setMe({ ...me, plane })
    if (r.ok) posthog.capture('plane_changed', { plane })
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
        {me.country && (
          <p className="spot-link">
            <Link href="/?spot">{me.spot ? 'Move your spot on the map' : 'Show where you live on the map'} <Arrow /></Link>
            <span className="fine">Planes sent to you will land right there.</span>
          </p>
        )}
      </div>
      <Passport handle={me.handle ?? ''} image={me.image} home={me.country} stamps={me.stamps ?? []} patronSince={me.patronSince ?? null} />
      <Support patronSince={me.patronSince ?? null} plane={me.plane ?? 'dart'} open={!!me.donations} onPlane={setPlane} />
      <p className="lede"><Link className="tag" href="/">See your planes on the map <Arrow /></Link></p>
    </main>
  )
}

