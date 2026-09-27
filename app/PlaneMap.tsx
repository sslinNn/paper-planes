'use client'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { countryName } from '@/lib/country'
import { at, distance, graticule, H, isoOf, land, path, projection, W } from '@/lib/geo'
import { countryOf, summarize, type PlaneRow, UNKNOWN } from '@/lib/sky'

type Flight = PlaneRow & { key: number; echo?: boolean }
type Focus = { iso: string; pinned: boolean } | null

const MAX_FLIGHTS = 160
const POLL_MS = 20_000
const REPLAY_MS = 2_600

const fetchPlanes = (after: number): Promise<PlaneRow[]> =>
  fetch(`/api/planes?after=${after}`).then((r) => (r.ok ? r.json() : [])).catch(() => [])

const landPaths = land.map((f) => ({ iso: isoOf(f), d: path(f) ?? '' }))

export default function PlaneMap() {
  const [history, setHistory] = useState<PlaneRow[]>([])
  const [flights, setFlights] = useState<Flight[]>([])
  const [focus, setFocus] = useState<Focus>(null)
  const seq = useRef(0)
  const stage = useRef<HTMLDivElement>(null)

  // на телефоне карта шире экрана — начинаем с середины мира
  useEffect(() => {
    const id = requestAnimationFrame(() => {
      const el = stage.current
      if (el && el.scrollWidth > el.clientWidth) el.scrollLeft = (el.scrollWidth - el.clientWidth) / 2
    })
    return () => cancelAnimationFrame(id)
  }, [])

  useEffect(() => {
    let rows: PlaneRow[] = []
    let lastId = 0
    const timers: ReturnType<typeof setTimeout>[] = []
    const fly = (p: PlaneRow, echo = false) =>
      setFlights((f) => [...f.slice(-(MAX_FLIGHTS - 1)), { ...p, key: ++seq.current, echo }])
    const take = (planes: PlaneRow[]) => {
      if (planes.length) lastId = Math.max(lastId, planes[0].id)
      rows = [...planes, ...rows].slice(0, 200)
      setHistory(rows)
      return planes
    }

    // первая волна вылетает вразнобой, а не все разом
    fetchPlanes(0).then((planes) =>
      take(planes).slice(0, 14).forEach((p, i) => timers.push(setTimeout(() => fly(p), i * 280))),
    )
    const poll = setInterval(async () => {
      const fresh = take(await fetchPlanes(lastId))
      fresh.forEach((p, i) => timers.push(setTimeout(() => fly(p), (i * POLL_MS) / fresh.length)))
    }, POLL_MS)
    // карта не должна стоять: старые самолётики перелетают снова
    const replay = setInterval(() => rows.length && fly(rows[Math.floor(Math.random() * rows.length)], true), REPLAY_MS)

    return () => {
      clearInterval(poll)
      clearInterval(replay)
      timers.forEach(clearTimeout)
    }
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setFocus(null)
    addEventListener('keydown', onKey)
    return () => removeEventListener('keydown', onKey)
  }, [])

  const sky = useMemo(() => summarize(history), [history])
  const busiest = useMemo(() => [...sky].filter(([, s]) => s.out > 0).sort((a, b) => b[1].out - a[1].out).slice(0, 12), [sky])
  const routes = useMemo(
    () => (focus ? history.filter((p) => countryOf(p.from_country) === focus.iso || countryOf(p.to_country) === focus.iso) : []),
    [history, focus],
  )

  const hover = useCallback((iso: string | null) => setFocus((f) => (f?.pinned ? f : iso ? { iso, pinned: false } : null)), [])
  const pin = useCallback((iso: string) => setFocus((f) => (f?.pinned && f.iso === iso ? null : { iso, pinned: true })), [])

  return (
    <>
      <div className="stage" ref={stage} onPointerLeave={() => hover(null)}>
        <svg viewBox={`0 0 ${W} ${H}`} className={`map${focus ? ' focused' : ''}`} role="img" aria-label="World map of replies on X flying as paper planes">
          <defs>
            <pattern id="halftone" width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(15)">
              <circle cx="2.5" cy="2.5" r=".95" fill="var(--blue)" />
            </pattern>
            <pattern id="halftone-dense" width="3.6" height="3.6" patternUnits="userSpaceOnUse" patternTransform="rotate(15)">
              <circle cx="1.8" cy="1.8" r="1.05" fill="var(--blue)" />
            </pattern>
          </defs>

          <path d={path(graticule) ?? ''} className="graticule" />
          <path d={path({ type: 'Sphere' }) ?? ''} className="sphere" />

          <g>
            {landPaths.map(({ iso, d }, i) => {
              const code = iso ?? ''
              const busy = !!iso && (sky.get(iso)?.out ?? 0) > 0
              return (
                <path
                  key={i}
                  d={d}
                  className={`land${busy ? ' busy' : ''}${focus && focus.iso === code ? ' on' : ''}`}
                  onPointerEnter={(e) => iso && e.pointerType === 'mouse' && hover(iso)}
                  onClick={() => iso && pin(iso)}
                />
              )
            })}
          </g>
          {/* второй прогон краски, чуть мимо приводки */}
          <g className="ghost" transform="translate(1.6 1.1)">
            {landPaths.map(({ d }, i) => <path key={i} d={d} />)}
          </g>

          <g className="routes">
            {routes.map((p) => {
              const d = arc(p)
              return d ? <path key={p.id} d={d} /> : null
            })}
          </g>

          {flights.map((f) => (
            <FlightView key={f.key} f={f} hit={!!focus && (countryOf(f.from_country) === focus.iso || countryOf(f.to_country) === focus.iso)} />
          ))}
        </svg>

        {focus && <CountryCard iso={focus.iso} sky={sky} pinned={focus.pinned} onClose={() => setFocus(null)} />}
      </div>

      <section className="skies" aria-labelledby="skies-title">
        <h2 id="skies-title">Busiest skies</h2>
        {busiest.length ? (
          <ol>
            {busiest.map(([iso, s]) => (
              <li key={iso}>
                <button
                  type="button"
                  aria-pressed={focus?.pinned && focus.iso === iso ? true : false}
                  onPointerEnter={(e) => e.pointerType === 'mouse' && hover(iso)}
                  onFocus={() => hover(iso)}
                  onClick={() => pin(iso)}
                >
                  {countryName(iso)} <b>{s.out}</b>
                </button>
              </li>
            ))}
          </ol>
        ) : (
          <p className="empty">The sky is quiet. Planes land here as soon as someone replies.</p>
        )}
      </section>
      <p className="colophon" aria-live="polite">
        <span className="counter">{history.length} recent flights</span>
        <span>Tap a country to meet who’s posting from there.</span>
      </p>
    </>
  )
}

function arc(p: PlaneRow) {
  const a = at(p.from_country)
  const b = at(p.to_country)
  return a === b ? null : path({ type: 'LineString', coordinates: [a, b] })
}

function FlightView({ f, hit }: { f: Flight; hit: boolean }) {
  const motion = useRef<SVGAnimateMotionElement>(null)
  useEffect(() => motion.current?.beginElement(), [])

  const a = at(f.from_country)
  const b = at(f.to_country)
  const [bx, by] = projection(b)!
  const d = arc(f)
  // длиннее маршрут — дольше полёт
  const dur = 2 + distance(a, b) * 1.4
  const style = { '--dur': `${dur.toFixed(2)}s` } as React.CSSProperties
  const cls = `flight${hit ? ' hit' : ''}${f.echo ? ' echo' : ''}`

  // одна страна — самолётик не летит, просто штамп на месте
  if (!d) return <circle className={cls + ' stamp'} cx={bx} cy={by} r={4} style={{ '--dur': '0s' } as React.CSSProperties} />

  const mask = `reveal-${f.key}`
  return (
    <g className={cls} style={style}>
      <mask id={mask} maskUnits="userSpaceOnUse">
        <path d={d} pathLength={1} className="reveal" />
      </mask>
      <path d={d} className="trail" mask={`url(#${mask})`} />
      <g className="plane">
        <animateMotion ref={motion} dur={`${dur.toFixed(2)}s`} begin="indefinite" fill="freeze" rotate="auto" path={d} />
        <g className="dart">
          <path className="wing" d="M13 0 L-10 -9 L-4 0 Z" />
          <path className="wing" d="M13 0 L-4 0 L-9 6 Z" />
          <path className="fold" d="M13 0 L-4 0 L-9 6 Z" />
        </g>
      </g>
      <circle className="stamp" cx={bx} cy={by} r={4} />
    </g>
  )
}

function CountryCard({ iso, sky, pinned, onClose }: { iso: string; sky: ReturnType<typeof summarize>; pinned: boolean; onClose: () => void }) {
  const s = sky.get(iso)
  const [x, y] = projection(at(iso === UNKNOWN ? null : iso))!
  // карточка встаёт с той стороны страны, где больше места
  const left = x / W > 0.55 ? `calc(${(x / W) * 100}% - min(330px, 86vw) - 24px)` : `calc(${(x / W) * 100}% + 24px)`
  const top = `clamp(0px, calc(${(y / H) * 100}% - 90px), calc(100% - 320px))`
  const out = s?.out ?? 0
  const people = s?.people ?? []

  return (
    <aside className="card" style={{ left, top }} aria-live="polite">
      {pinned && <button className="close" onClick={onClose} aria-label="Close">×</button>}
      <h2>{countryName(iso)}</h2>
      {iso === UNKNOWN && <p className="note">Planes from places we couldn’t pin down land here.</p>}
      <div className="tally">
        <b style={{ '--vol': `${Math.min(4.4, 2 + Math.log2(1 + out) * 0.45)}rem` } as React.CSSProperties}>{out}</b>
        <span>{out === 1 ? 'plane out' : 'planes out'} · {s?.in ?? 0} in</span>
      </div>
      {people.length ? (
        <>
          <h3>Posting from here</h3>
          <ul className="people">
            {people.slice(0, 6).map(([h]) => (
              <li key={h}><a href={`https://x.com/${h}`} target="_blank" rel="noopener noreferrer">@{h}</a></li>
            ))}
            {people.length > 6 && <li className="more">+{people.length - 6} more</li>}
          </ul>
          <h3>Flying to</h3>
          <ul className="dests">
            {s!.destinations.slice(0, 3).map(([c, n]) => <li key={c}><span>{countryName(c)}</span><span>{n}</span></li>)}
          </ul>
        </>
      ) : (
        <p className="note">No planes from here yet. Reply to someone on X and yours will be the first.</p>
      )}
    </aside>
  )
}
