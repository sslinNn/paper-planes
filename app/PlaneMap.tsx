'use client'
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { countryName } from '@/lib/country'
import { at, distance, graticule, H, isoOf, land, path, projection, W } from '@/lib/geo'
import { countryOf, summarize, type PlaneRow, UNKNOWN } from '@/lib/sky'
import { Close } from './icons'

type Flight = PlaneRow & { key: number; echo?: boolean }
type Focus = { iso: string; pinned: boolean } | null
type Sky = ReturnType<typeof summarize>

const MAX_FLIGHTS = 160
const POLL_MS = 20_000
const REPLAY_MS = 2_600
const TRAIL_MS = 60_000
// одна кривая на полёт: и самолётик, и проявка следа
const EASE = '.45 0 .25 1'

const fetchPlanes = (after: number): Promise<PlaneRow[]> =>
  fetch(`/api/planes?after=${after}`).then((r) => (r.ok ? r.json() : [])).catch(() => [])

const landPaths = land.map((f) => ({ iso: isoOf(f), d: path(f) ?? '' }))

export default function PlaneMap({ children }: { children: ReactNode }) {
  const [history, setHistory] = useState<PlaneRow[]>([])
  const [flights, setFlights] = useState<Flight[]>([])
  const [focus, setFocus] = useState<Focus>(null)
  const [panned, setPanned] = useState(false)
  const seq = useRef(0)
  const stage = useRef<HTMLDivElement>(null)
  const svg = useRef<SVGSVGElement>(null)
  const spread = useRef<HTMLDivElement>(null)

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
    // один живой след на маршрут: повторы и дубли летят без следа и штампа, иначе розовый копится до красного
    const inked = new Map<string, number>()
    const fly = (p: PlaneRow, replay = false) => {
      const route = `${p.from_country}>${p.to_country}`
      const echo = replay || Date.now() - (inked.get(route) ?? 0) < TRAIL_MS
      if (!echo) inked.set(route, Date.now())
      setFlights((f) => [...f.slice(-(MAX_FLIGHTS - 1)), { ...p, key: ++seq.current, echo }])
    }
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
    // карта не должна стоять: старые самолётики перелетают снова, эхом, без нового следа
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
  const busiest = useMemo(
    () => [...sky].sort((a, b) => b[1].out + b[1].in - (a[1].out + a[1].in)).slice(0, 14),
    [sky],
  )
  const routes = useMemo(
    () => (focus ? history.filter((p) => countryOf(p.from_country) === focus.iso || countryOf(p.to_country) === focus.iso) : []),
    [history, focus],
  )

  // мышь: карточка живёт только пока курсор над страной (или над самой карточкой).
  // уход — с короткой задержкой, чтобы успеть довести курсор до ссылок в карточке
  const leaveTimer = useRef<ReturnType<typeof setTimeout>>(undefined)
  const hover = useCallback((iso: string | null) => {
    clearTimeout(leaveTimer.current)
    if (iso) setFocus((f) => (f?.pinned ? f : { iso, pinned: false }))
    else leaveTimer.current = setTimeout(() => setFocus((f) => (f?.pinned ? f : null)), 160)
  }, [])
  const keep = useCallback(() => clearTimeout(leaveTimer.current), [])
  // палец и клавиатура: тап/Enter закрепляет, повтор — убирает. Клик мышью ничего не закрепляет
  const pin = useCallback((iso: string, e: React.MouseEvent) => {
    if ((e.nativeEvent as PointerEvent).pointerType === 'mouse') return
    setFocus((f) => (f?.pinned && f.iso === iso ? null : { iso, pinned: true }))
  }, [])

  return (
    <>
      <div className="spread" ref={spread}>
        {/* шапка листа: над картой, а не поверх неё — карта целиком видна всегда */}
        <header className="masthead">
          {children}
          <p className="counter"><b>{history.length}</b> recent flights</p>
        </header>
        <div className="stage" ref={stage} onPointerDown={() => setPanned(true)}>
          {/* тап по океану убирает закреплённую карточку */}
          <svg
            ref={svg}
            viewBox={`0 0 ${W} ${H.toFixed(1)}`}
            preserveAspectRatio="xMidYMid meet"
            className={`map${focus ? ' focused' : ''}`}
            role="img"
            aria-label="World map of replies on X flying as paper planes"
          >
            <defs>
              <pattern id="halftone" width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(15)">
                <circle cx="2.5" cy="2.5" r=".95" fill="var(--blue)" />
              </pattern>
              <pattern id="halftone-dense" width="3.6" height="3.6" patternUnits="userSpaceOnUse" patternTransform="rotate(15)">
                <circle cx="1.8" cy="1.8" r="1.05" fill="var(--blue)" />
              </pattern>
            </defs>

            <rect width={W} height={H} fill="transparent" onClick={() => setFocus(null)} />
            <path d={path(graticule) ?? ''} className="graticule" />

            <g>
              {landPaths.map(({ iso, d }, i) => {
                const busy = !!iso && (sky.get(iso)?.out ?? 0) > 0
                return (
                  <path
                    key={i}
                    d={d}
                    className={`land${busy ? ' busy' : ''}${focus && focus.iso === iso ? ' on' : ''}`}
                    onPointerEnter={(e) => iso && e.pointerType === 'mouse' && hover(iso)}
                    onPointerLeave={(e) => e.pointerType === 'mouse' && hover(null)}
                    onClick={(e) => (iso ? pin(iso, e) : setFocus(null))}
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
        </div>

        {!panned && <p className="pan-hint" aria-hidden="true">Drag to see the world</p>}

        {focus && <CountryCard iso={focus.iso} sky={sky} pinned={focus.pinned} svg={svg} spread={spread} onClose={() => setFocus(null)} onEnter={keep} onLeave={() => hover(null)} />}
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
                  onPointerLeave={(e) => e.pointerType === 'mouse' && hover(null)}
                  onFocus={() => hover(iso)}
                  onBlur={() => hover(null)}
                  onClick={(e) => pin(iso, e)}
                >
                  {countryName(iso)} <b>{s.out + s.in}</b>
                </button>
              </li>
            ))}
          </ol>
        ) : (
          <p className="empty">The sky is quiet. Planes land here as soon as someone replies.</p>
        )}
        <p className="colophon">Hover or tap a country to meet who’s posting from there.</p>
      </section>
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
      {!f.echo && (
        <>
          <mask id={mask} maskUnits="userSpaceOnUse">
            <path d={d} pathLength={1} className="reveal" />
          </mask>
          <path d={d} className="trail" mask={`url(#${mask})`} />
        </>
      )}
      <g className="plane">
        <animateMotion
          ref={motion}
          dur={`${dur.toFixed(2)}s`}
          begin="indefinite"
          fill="freeze"
          rotate="auto"
          path={d}
          keyPoints="0;1"
          keyTimes="0;1"
          calcMode="spline"
          keySplines={EASE}
        />
        <g className="dart">
          <path className="wing" d="M13 0 L-10 -9 L-4 0 Z" />
          <path className="wing" d="M13 0 L-4 0 L-9 6 Z" />
          <path className="fold" d="M13 0 L-4 0 L-9 6 Z" />
        </g>
      </g>
      {!f.echo && <circle className="stamp" cx={bx} cy={by} r={4} />}
    </g>
  )
}

function CountryCard({ iso, sky, pinned, svg, spread, onClose, onEnter, onLeave }: {
  iso: string; sky: Sky; pinned: boolean; onClose: () => void; onEnter: () => void; onLeave: () => void
  svg: React.RefObject<SVGSVGElement | null>; spread: React.RefObject<HTMLDivElement | null>
}) {
  const card = useRef<HTMLElement>(null)
  const s = sky.get(iso)
  const out = s?.out ?? 0
  const people = s?.people ?? []

  // карточка встаёт рядом со страной на экране, с той стороны, где больше места
  useLayoutEffect(() => {
    const el = svg.current
    const box = spread.current?.getBoundingClientRect()
    const m = el?.getScreenCTM()
    if (!el || !box || !m || !card.current) return
    const [x, y] = projection(at(iso === UNKNOWN ? null : iso))!
    const pt = new DOMPoint(x, y).matrixTransform(m)
    const cx = pt.x - box.left
    const cy = pt.y - box.top
    const cardW = Math.min(340, box.width * 0.86)
    const left = cx > box.width * 0.55 ? cx - cardW - 28 : cx + 28
    card.current.style.left = `${Math.max(12, Math.min(left, box.width - cardW - 12))}px`
    // не заезжаем на шапку листа
    const floor = (el.parentElement?.offsetTop ?? 0) + 12
    card.current.style.top = `${Math.max(floor, Math.min(cy - 90, box.height - 400))}px`
    card.current.style.visibility = 'visible'
  }, [iso, svg, spread])

  return (
    <aside className="card" ref={card} style={{ visibility: 'hidden' }} aria-live="polite" onPointerEnter={onEnter} onPointerLeave={(e) => e.pointerType === 'mouse' && onLeave()}>
      {pinned && <button className="close" onClick={onClose} aria-label="Close"><Close /></button>}
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
            {people.slice(0, 5).map(([h]) => (
              <li key={h}><a href={`https://x.com/${h}`} target="_blank" rel="noopener noreferrer">@{h}</a></li>
            ))}
            {people.length > 5 && <li className="more">+{people.length - 5} more</li>}
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
