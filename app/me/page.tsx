'use client'
import Link from 'next/link'
import { identify, track } from '@/lib/track'
import { useEffect, useState } from 'react'
import { countryNames } from '@/lib/country'
import Passport, { type Stamp } from './Passport'
import Support from './Support'
import Hangar from './Hangar'
import type { PlaneModel } from '@/lib/patrons'
import { kmFlown, summary } from '@/lib/pilot'
import { Arrow, XMark } from '../icons'

type Me = {
  handle: string; country: string | null; image?: string | null; stamps?: Stamp[]
  patronSince?: string | null; plane?: PlaneModel; donations?: boolean; spot?: [number, number] | null
  airmail?: Stamp[]; xp?: number
}
const options = countryNames()

// пост в X со ссылкой на карточку /p/@handle — её превью и есть реклама. Км звучат громче, чем «2 страны»
function shareUrl(handle: string, home: string | null, stamps: Stamp[]) {
  const { countries } = summary(stamps)
  const km = kmFlown(home, stamps)
  const where = `${countries} ${countries === 1 ? 'country' : 'countries'}`
  const text = km
    ? `My replies on X flew ${km.toLocaleString('en')} km across ${where} as paper planes ✈️`
    : countries
      ? `My replies on X flew to ${where} as paper planes ✈️`
      : 'My replies on X are paper planes now ✈️'
  const url = `${location.origin}/p/${handle}?ref=${handle}`
  return `https://x.com/intent/post?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`
}

export default function MePage() {
  const [me, setMe] = useState<Me | null | undefined>(undefined)
  const [status, setStatus] = useState('')

  useEffect(() => {
    const thanks = new URLSearchParams(location.search).has('thanks')
    const load = () => fetch(thanks ? '/api/me?sync=1' : '/api/me').then(async (r) => (r.ok ? ((await r.json()) as Me) : null))
    // ждём минуту, пока не появится то, за чем пришли: после оплаты — статус донатера (вебхук не мгновенный),
    // у нового юзера — первые самолётики (сбор реплаев запускается на первом GET /api/me и идёт несколько секунд)
    const waiting = (m: Me | null) => (thanks ? !m?.patronSince : !!m && !m.stamps?.length)
    let t: ReturnType<typeof setInterval> | undefined
    load().then((m) => {
      setMe(m)
      // склеиваем анонимные визиты с X-хэндлом, чтобы в PostHog видеть путь человека целиком
      if (m?.handle) identify(m.handle, { handle: m.handle, country: m.country, patron: !!m.patronSince })
      if (thanks) track('donation_returned', { outcome: 'paid', patron: !!m?.patronSince })
      if (!waiting(m)) return
      setStatus(thanks ? 'Thank you! Your gold arrives as soon as the payment clears.' : 'Your planes are taking off: reading your replies on X…')
      let tries = 0
      t = setInterval(async () => {
        const next = await load()
        if (!waiting(next) || ++tries > 12) {
          clearInterval(t)
          if (next) setMe(next)
          if (!waiting(next) || !thanks) setStatus('')
          if (!thanks && next?.stamps?.length) track('first_planes_landed', { planes: summary(next.stamps).planes })
        }
      }, 5000)
    })
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
    if (r.ok) track('country_set', { country })
    setStatus(r.ok ? 'Saved. Your next planes take off from here.' : 'Couldn’t save that. Try again in a moment.')
  }

  const setPlane = async (plane: PlaneModel) => {
    const r = await fetch('/api/me', { method: 'POST', body: JSON.stringify({ plane }) })
    if (r.ok) setMe({ ...me, plane })
    if (r.ok) track('plane_changed', { plane })
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
      {me.handle && (
        <p className="lede share">
          <a className="tag" href={shareUrl(me.handle, me.country, me.stamps ?? [])} target="_blank" rel="noopener"
            onClick={() => track('share_sky', { countries: summary(me.stamps ?? []).countries })}>
            <XMark /> Share my sky
          </a>
        </p>
      )}
      <p className="lede"><Link className="tag" href="/play">Play Airmail: fly your replies <Arrow /></Link></p>
      <Passport handle={me.handle ?? ''} image={me.image} home={me.country} stamps={me.stamps ?? []} patronSince={me.patronSince ?? null} airmail={me.airmail ?? []} />
      <p className="fine">Jev reads each reply once to fold it into an Airmail letter; the text is never stored.</p>
      <Hangar xp={me.xp ?? 0} plane={me.plane ?? 'dart'} onPlane={setPlane} />
      <Support patronSince={me.patronSince ?? null} open={!!me.donations} />
      <p className="lede"><Link className="tag" href="/">See your planes on the map <Arrow /></Link></p>
    </main>
  )
}

