'use client'
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { countryName } from '@/lib/country'
import { at, distance, EARTH_KM, graticule, H, isoOf, land, path, projection, W } from '@/lib/geo'
import { countryOf, flightLog, routeKey, routes as routesOf, summarize, timeAgo, Traffic, type PlaneRow, UNKNOWN, userInk } from '@/lib/sky'
import { isPlaneModel, type PlaneModel } from '@/lib/patrons'
import { Close } from './icons'
import Live from './Live'
import { OWNER } from '@/lib/site'

type Point = [number, number]
// a, b — откуда и куда летит, считаются один раз при взлёте
type Flight = PlaneRow & { key: number; echo?: boolean; count: number; a: Point; b: Point }
type Sky = ReturnType<typeof summarize>
type Local = { handle: string; country: string; image: string | null; patron: boolean; spot: Point | null }
type Homes = Map<string, Local>

const MAX_FLIGHTS = 160
const POLL_MS = 20_000
const REPLAY_MS = 2_600
const TRAIL_MS = 60_000
// сколько самолётиков одновременно в небе — больше превращается в кашу
const MAX_AIR = 10
const MAX_ZOOM = 5

// длиннее маршрут — дольше полёт
const flightSeconds = (a: Point, b: Point) => 2 + distance(a, b) * 1.4
// дом пилота: его точка на карте, если он всё ещё живёт в этой стране, иначе центр страны
const home = (homes: Homes, handle: string, country: string | null): Point => {
  const u = homes.get(handle)
  return u?.spot && u.country === country ? u.spot : at(country)
}
const endsOf = (p: PlaneRow, homes: Homes): [Point, Point] => [home(homes, p.from_handle, p.from_country), home(homes, p.to_handle, p.to_country)]
// одна кривая на полёт: и самолётик, и проявка следа
const EASE = '.45 0 .25 1'
const km = (n: number) => `${Math.round(n).toLocaleString('en')} km`
const routeName = (key: string) => key.split('>').map(countryName).join(' → ')

const fetchPlanes = (after: number): Promise<PlaneRow[]> =>
  fetch(`/api/planes?after=${after}`).then((r) => (r.ok ? r.json() : [])).catch(() => [])
type Me = { handle?: string; country?: string | null; spot?: Point | null }
const fetchMe = (): Promise<Me | null> => fetch('/api/me').then((r) => (r.ok ? r.json() : null)).catch(() => null)
const fetchLocals = (): Promise<Local[]> => fetch('/api/locals').then((r) => (r.ok ? r.json() : [])).catch(() => [])
// своя точка — из /api/me: /api/locals CDN держит минуту, а себя надо видеть сразу после сохранения
const withMySpot = (locals: Local[], me: string | null, spot: Point | null | undefined) =>
  spot === undefined ? locals : locals.map((u) => (u.handle === me ? { ...u, spot } : u))

const landPaths = land.map((f) => ({ iso: isoOf(f), d: path(f) ?? '' }))
// статика карты считаем и строим один раз, а не на каждый взлёт самолётика
const GRATICULE = path(graticule) ?? ''
const GHOST = (
  <g className="ghost" transform="translate(1.6 1.1)">
    {landPaths.map(({ d }, i) => <path key={i} d={d} />)}
  </g>
)

// pilot — карточка /p/@handle: его самолётики в фокусе, а его старые маршруты подмешаны в историю
export default function PlaneMap({ children, pilot }: { children: ReactNode; pilot?: { handle: string; planes: PlaneRow[] } }) {
  const star = pilot?.handle ?? null
  const [history, setHistory] = useState<PlaneRow[]>([])
  const [flights, setFlights] = useState<Flight[]>([])
  // страна с открытой карточкой — только по клику/тапу, наведение ничего не открывает
  const [focus, setFocus] = useState<string | null>(null)
  const [panned, setPanned] = useState(false)
  const [me, setMe] = useState<string | null>(null)
  const [locals, setLocals] = useState<Local[]>([])
  const [myCountry, setMyCountry] = useState<string | null>(null)
  const [mySpot, setMySpot] = useState<Point | null | undefined>(undefined)
  // /?spot — режим «ткни, где живёшь»: тап по своей стране сохраняет точку
  const [placing, setPlacing] = useState(false)
  const [hint, setHint] = useState<string | null>(null)
  const people = useMemo(() => withMySpot(locals, me, mySpot), [locals, me, mySpot])
  const homes = useMemo<Homes>(() => new Map(people.map((u) => [u.handle, u])), [people])
  const homesRef = useRef(homes)
  useEffect(() => {
    homesRef.current = homes
  }, [homes])
  const meRef = useRef<string | null>(null)
  const seq = useRef(0)
  const stage = useRef<HTMLDivElement>(null)
  const svg = useRef<SVGSVGElement>(null)
  const canvas = useRef<HTMLDivElement>(null)
  const spread = useRef<HTMLDivElement>(null)

  // на телефоне карта шире экрана — начинаем с середины мира
  useEffect(() => {
    const id = requestAnimationFrame(() => {
      const el = stage.current
      if (el && el.scrollWidth > el.clientWidth) el.scrollLeft = (el.scrollWidth - el.clientWidth) / 2
    })
    return () => cancelAnimationFrame(id)
  }, [])

  // приближение: щипок на телефоне; на ПК — щипок тачпада, ctrl+колесо и кнопки ±. Карта растёт внутри .stage,
  // а таскают её прокруткой (пальцем) или мышью. Точка под пальцами/курсором остаётся на месте.
  // Масштаб живёт в ref, не в state: щипок не перерисовывает React-дерево на каждом кадре
  const zoom = useRef(1)
  const zoomAt = useCallback((next: number, cx?: number, cy?: number) => {
    const el = stage.current
    const map = canvas.current
    if (!el || !map) return
    next = Math.min(MAX_ZOOM, Math.max(1, next))
    if (next === zoom.current) return
    const box = el.getBoundingClientRect()
    const x = (cx ?? box.left + box.width / 2) - box.left
    const y = (cy ?? box.top + box.height / 2) - box.top
    const f = next / zoom.current
    const sl = el.scrollLeft
    const st = el.scrollTop
    zoom.current = next
    map.style.setProperty('--zoom', String(next))
    el.toggleAttribute('data-zoomed', next > 1)
    el.scrollLeft = (sl + x) * f - x
    el.scrollTop = (st + y) * f - y
  }, [])
  useEffect(() => {
    const el = stage.current
    if (!el) return
    // щипок: пока пальцы на экране, холст только масштабируется transform-ом (композитор, без раскладки
    // и перерисовки карты); настоящий размер — один раз, когда пальцы отпустили. Иначе на телефоне всё дёргается
    let pinch: { d: number; x: number; y: number; s: number; dx: number; dy: number } | null = null
    const dist = (t: TouchList) => Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY)
    const mid = (t: TouchList) => [(t[0].clientX + t[1].clientX) / 2, (t[0].clientY + t[1].clientY) / 2]
    const start = (e: TouchEvent) => {
      if (e.touches.length !== 2 || !canvas.current) return
      const [x, y] = mid(e.touches)
      const box = el.getBoundingClientRect()
      // точка под пальцами в координатах холста
      canvas.current.style.transformOrigin = `${x - box.left + el.scrollLeft}px ${y - box.top + el.scrollTop}px`
      pinch = { d: dist(e.touches), x, y, s: 1, dx: 0, dy: 0 }
    }
    const move = (e: TouchEvent) => {
      if (!pinch || e.touches.length !== 2 || !canvas.current) return
      e.preventDefault()
      const [x, y] = mid(e.touches)
      const k = zoom.current
      pinch.s = Math.min(MAX_ZOOM, Math.max(1, (k * dist(e.touches)) / pinch.d)) / k
      pinch.dx = x - pinch.x
      pinch.dy = y - pinch.y
      canvas.current.style.transform = `translate(${pinch.dx}px, ${pinch.dy}px) scale(${pinch.s})`
    }
    const end = (e: TouchEvent) => {
      if (!pinch || e.touches.length >= 2 || !canvas.current) return
      const p = pinch
      pinch = null
      canvas.current.style.transform = ''
      zoomAt(zoom.current * p.s, p.x, p.y)
      el.scrollLeft -= p.dx
      el.scrollTop -= p.dy
    }
    const wheel = (e: WheelEvent) => {
      if (!e.ctrlKey) return
      e.preventDefault()
      zoomAt(zoom.current * Math.exp(-e.deltaY / 100), e.clientX, e.clientY)
    }
    // мышь: приближенную карту таскают зажатой кнопкой. Протащили — клик по стране под курсором не считается
    let drag: { x: number; y: number; sl: number; st: number; moved: boolean } | null = null
    let dragged = false
    const down = (e: PointerEvent) => {
      if (e.pointerType !== 'mouse' || e.button !== 0 || zoom.current === 1) return
      drag = { x: e.clientX, y: e.clientY, sl: el.scrollLeft, st: el.scrollTop, moved: false }
    }
    const drift = (e: PointerEvent) => {
      if (!drag) return
      const dx = e.clientX - drag.x
      const dy = e.clientY - drag.y
      if (!drag.moved && Math.hypot(dx, dy) < 4) return
      if (!drag.moved) el.setAttribute('data-dragging', '')
      drag.moved = true
      el.scrollLeft = drag.sl - dx
      el.scrollTop = drag.st - dy
    }
    const up = () => {
      dragged = !!drag?.moved
      drag = null
      el.removeAttribute('data-dragging')
    }
    // capture на .stage срабатывает раньше React-обработчиков на корне
    const swallow = (e: MouseEvent) => {
      if (!dragged) return
      dragged = false
      e.stopPropagation()
    }
    el.addEventListener('touchstart', start, { passive: true })
    el.addEventListener('touchmove', move, { passive: false })
    el.addEventListener('touchend', end)
    el.addEventListener('touchcancel', end)
    el.addEventListener('wheel', wheel, { passive: false })
    el.addEventListener('pointerdown', down)
    addEventListener('pointermove', drift)
    addEventListener('pointerup', up)
    el.addEventListener('click', swallow, true)
    return () => {
      el.removeEventListener('pointerdown', down)
      removeEventListener('pointermove', drift)
      removeEventListener('pointerup', up)
      el.removeEventListener('click', swallow, true)
      el.removeEventListener('touchstart', start)
      el.removeEventListener('touchmove', move)
      el.removeEventListener('touchend', end)
      el.removeEventListener('touchcancel', end)
      el.removeEventListener('wheel', wheel)
    }
  }, [zoomAt])

  useEffect(() => {
    let rows: PlaneRow[] = []
    let lastId = 0
    const timers: ReturnType<typeof setTimeout>[] = []
    // один живой след на маршрут: повторы летят без следа и штампа, иначе розовый копится до красного
    const inked = new Map<string, number>()
    const traffic = new Traffic(MAX_AIR)
    // реплаи, которым не хватило места в небе, ждут своей очереди
    let pending: PlaneRow[] = []
    const countOf = (key: string) => routesOf(rows).find((r) => r.key === key)?.count ?? 1

    const fly = (p: PlaneRow, replay = false) => {
      // в фоновой вкладке не взлетаем: CSS-анимация прозрачности там не стартует без кадров,
      // а SMIL-полёт идёт по часам — по возвращении самолётик висит в точке прилёта
      if (document.hidden) return false
      const route = routeKey(p)
      const [a, b] = endsOf(p, homesRef.current)
      if (!traffic.takeoff(route, flightSeconds(a, b) * 1000 + 600)) return false
      const echo = replay || Date.now() - (inked.get(route) ?? 0) < TRAIL_MS
      if (!echo) inked.set(route, Date.now())
      setFlights((f) => [...f.slice(-(MAX_FLIGHTS - 1)), { ...p, key: ++seq.current, echo, count: countOf(route), a, b }])
      return true
    }
    const take = (planes: PlaneRow[]) => {
      // опрос без новостей не должен перерисовывать всю карту
      if (!planes.length) return planes
      lastId = Math.max(lastId, planes[0].id)
      rows = [...planes, ...rows].slice(0, 200)
      setHistory(rows)
      return planes
    }

    // первая волна: по одному самолётику на маршрут, вразнобой. Ждёт и зрителя, и местных:
    // без них самолётики взлетали бы из центров стран, а не от аватарок — «из ниоткуда»
    Promise.all([fetchPlanes(0), fetchMe(), fetchLocals()]).then(([planes, m, ls]) => {
      // кто смотрит: свои самолётики крупнее и ярче, летящие к тебе — с ленточкой «→ you»
      meRef.current = m?.handle ?? null
      setMe(meRef.current)
      setMyCountry(m?.country ?? null)
      setMySpot(m?.spot ?? null)
      if (m?.handle && new URLSearchParams(location.search).has('spot')) setPlacing(true)
      // /?country=BR — ссылка с табло /traffic: сразу открыть карточку страны
      const linked = new URLSearchParams(location.search).get('country')
      if (linked && /^[A-Z]{2}$/.test(linked)) setFocus(linked)
      setLocals(ls)
      // ref сразу, не дожидаясь рендера: первая волна взлетает раньше, чем обновится homes
      homesRef.current = new Map(withMySpot(ls, meRef.current, m?.spot ?? null).map((u) => [u.handle, u]))
      take(planes)
      // ponytail: старые рейсы пилота вытеснятся из истории после 200 новых — страницу почти никто не держит так долго
      if (pilot) {
        const ids = new Set(rows.map((p) => p.id))
        rows = [...rows, ...pilot.planes.filter((p) => !ids.has(p.id))]
        setHistory(rows)
      }
      const all = routesOf(rows)
      const first = star ? [...all.filter((r) => r.lead.from_handle === star), ...all.filter((r) => r.lead.from_handle !== star)] : all
      first
        .slice(0, MAX_AIR)
        .forEach((r, i) => timers.push(setTimeout(() => fly(r.lead), i * 450)))
    })
    const poll = setInterval(async () => {
      const fresh = take(await fetchPlanes(lastId))
      // новые — по одному на маршрут, остальные ждут в очереди
      const seen = new Set<string>()
      for (const p of fresh.reverse()) {
        if (seen.has(routeKey(p))) continue
        seen.add(routeKey(p))
        pending.push(p)
      }
      // фоновая вкладка копит очередь, а взлетать не может — по возвращении показываем только свежее
      pending = pending.slice(-MAX_AIR * 2)
    }, POLL_MS)
    // карта не должна стоять: сначала очередь новых, потом маршруты из истории (половина — свои)
    const replay = setInterval(() => {
      const next = pending[0]
      if (next) {
        if (fly(next)) pending = pending.slice(1)
        return
      }
      const all = routesOf(rows)
      const me = meRef.current
      const mine = star ? all.filter((r) => r.lead.from_handle === star) : me ? all.filter((r) => r.lead.from_handle === me || r.lead.to_handle === me) : []
      const pool = mine.length && Math.random() < (star ? 0.8 : 0.5) ? mine : all
      for (let i = 0; i < 4 && pool.length; i++) if (fly(pool[Math.floor(Math.random() * pool.length)].lead, true)) break
    }, REPLAY_MS)

    return () => {
      clearInterval(poll)
      clearInterval(replay)
      timers.forEach(clearTimeout)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- пилот приходит с сервера один раз
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
  const log = useMemo(() => flightLog(history, (p) => distance(...endsOf(p, homes)) * EARTH_KM), [history, homes])
  const routes = useMemo(
    () => (focus ? history.filter((p) => countryOf(p.from_country) === focus || countryOf(p.to_country) === focus) : []),
    [history, focus],
  )

  // клик, тап и Enter открывают карточку, повтор — закрывает. pointerType у click не смотрим:
  // iOS Safari отдаёт у тапа 'mouse', и тап по стране там молча ничего не делал
  const pin = useCallback((iso: string) => {
    setFocus((f) => (f === iso ? null : iso))
  }, [])

  const stopPlacing = (note: string | null) => {
    setPlacing(false)
    window.history.replaceState(null, '', location.pathname)
    setHint(note)
    if (note) setTimeout(() => setHint(null), 5000)
  }
  // тап в режиме выбора: экран → координаты карты → долгота/широта. Сервер ещё раз проверит, что это твоя страна
  const place = async (iso: string | null, e: React.MouseEvent) => {
    if (!myCountry) return
    if (iso !== myCountry) return setHint(`That’s not ${countryName(myCountry)}. Tap inside it.`)
    const m = svg.current?.getScreenCTM()
    if (!m) return
    const pt = new DOMPoint(e.clientX, e.clientY).matrixTransform(m.inverse())
    const spot = projection.invert!([pt.x, pt.y]) as Point
    const r = await fetch('/api/me', { method: 'POST', body: JSON.stringify({ spot }) })
    if (!r.ok) return setHint('Couldn’t save that. Try again in a moment.')
    const saved = ((await r.json()) as { spot: Point }).spot
    setMySpot(saved)
    stopPlacing('Saved. Planes sent to you now land right here.')
  }

  const mapCls = `map${focus ? ' focused' : ''}${star ?? me ? ' personal' : ''}${placing ? ' placing' : ''}`

  return (
    <>
      <div className="spread" ref={spread}>
        {/* шапка листа: над картой, а не поверх неё — карта целиком видна всегда */}
        <header className="masthead">
          {children}
          <p className="counter">
            {star ? (
              <><b>{history.filter((p) => p.from_handle === star).length}</b> flights by @{star}</>
            ) : me ? (
              <><b>{history.filter((p) => p.from_handle === me).length}</b> of {history.length} recent flights are yours</>
            ) : (
              <><b>{history.length}</b> recent flights</>
            )}
          </p>
          <p className="byline">
            built by <a href={`https://x.com/${OWNER}`} target="_blank" rel="noopener">@{OWNER}</a>
          </p>
        </header>
        <div className="stage" ref={stage} onPointerDown={() => setPanned(true)}>
          {/* холст: два слоя с одной геометрией. Внизу статичная карта, она рисуется один раз на масштаб;
              сверху прозрачное небо с самолётиками, его перерисовка не трогает тяжёлую карту с растром */}
          <div className="canvas" ref={canvas} style={{ aspectRatio: `${W} / ${H.toFixed(1)}` }}>
          {/* тап по океану убирает закреплённую карточку */}
          <svg
            ref={svg}
            viewBox={`0 0 ${W} ${H.toFixed(1)}`}
            preserveAspectRatio="xMidYMid slice"
            className={mapCls}
            role="img"
            aria-label="World map of replies on X flying as paper planes"
          >
            <defs>
              <clipPath id="round" clipPathUnits="objectBoundingBox"><circle cx=".5" cy=".5" r=".5" /></clipPath>
              <pattern id="halftone" width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(15)">
                <circle cx="2.5" cy="2.5" r=".95" fill="var(--blue)" />
              </pattern>
              <pattern id="halftone-dense" width="3.6" height="3.6" patternUnits="userSpaceOnUse" patternTransform="rotate(15)">
                <circle cx="1.8" cy="1.8" r="1.05" fill="var(--blue)" />
              </pattern>
            </defs>

            <rect width={W} height={H} fill="transparent" onClick={(e) => (placing ? place(null, e) : setFocus(null))} />
            <path d={GRATICULE} className="graticule" />

            <g>
              {landPaths.map(({ iso, d }, i) => {
                const busy = !!iso && (sky.get(iso)?.out ?? 0) > 0
                return (
                  <path
                    key={i}
                    d={d}
                    className={`land${busy ? ' busy' : ''}${iso && focus === iso ? ' on' : ''}${iso && placing && iso === myCountry ? ' home' : ''}`}
                    onClick={(e) => (placing ? place(iso, e) : iso ? pin(iso) : setFocus(null))}
                  />
                )
              })}
            </g>
            {/* второй прогон краски, чуть мимо приводки */}
            {GHOST}

            <Locals people={people} me={me} />

            <g className="routes">
              {routes.map((p) => {
                const d = arc(...endsOf(p, homes))
                return d ? <path key={p.id} d={d} /> : null
              })}
            </g>

          </svg>
          <svg viewBox={`0 0 ${W} ${H.toFixed(1)}`} preserveAspectRatio="xMidYMid slice" className={mapCls + ' sky'} aria-hidden="true">
            <defs>
              {/* свой клип у неба: ссылки на defs соседнего <svg> Safari понимает через раз */}
              <clipPath id="round-sky" clipPathUnits="objectBoundingBox"><circle cx=".5" cy=".5" r=".5" /></clipPath>
              {/* золотая фольга донатеров: металлическая краска ризографа с бегущим бликом */}
              <linearGradient id="foil" x1="-1" y1="0" x2="0" y2="0" gradientUnits="objectBoundingBox" spreadMethod="repeat">
                <stop offset="0" stopColor="#9a6f1f" />
                <stop offset=".45" stopColor="#d9ad4b" />
                <stop offset=".5" stopColor="#fff1c2" />
                <stop offset=".55" stopColor="#d9ad4b" />
                <stop offset="1" stopColor="#9a6f1f" />
                <animateTransform attributeName="gradientTransform" type="translate" from="0 0" to="2 0" dur="2.4s" repeatCount="indefinite" />
              </linearGradient>
            </defs>
            {flights.map((f) => (
              <FlightView
                key={f.key}
                f={f}
                me={me}
                lead={star ?? me}
                hit={!!focus && (countryOf(f.from_country) === focus || countryOf(f.to_country) === focus)}
              />
            ))}
          </svg>
          </div>
        </div>

        <div className="zoom">
          <button type="button" aria-label="Zoom in" onClick={() => zoomAt(zoom.current * 1.6)}>+</button>
          <button type="button" aria-label="Zoom out" onClick={() => zoomAt(zoom.current / 1.6)}>−</button>
        </div>
        <Arrivals planes={history.slice(0, 12)} />
        {!panned && !placing && <p className="pan-hint" aria-hidden="true">Drag to see the world</p>}
        {(placing || hint) && (
          <p className="placing-hint" role="status">
            {hint ?? (myCountry ? <>Tap where you live in {countryName(myCountry)}. Everyone sees it, so roughly is fine.</> : <>Pick your country on <a href="/me">your page</a> first.</>)}
            {placing && <button type="button" onClick={() => stopPlacing(null)}>Cancel</button>}
          </p>
        )}

        {focus && <CountryCard iso={focus} sky={sky} svg={svg} spread={spread} onClose={() => setFocus(null)} />}
      </div>

      <section className="skies" aria-labelledby="skies-title">
        <h2 id="skies-title">Busiest skies</h2>
        {busiest.length ? (
          <ol>
            {busiest.map(([iso, s]) => (
              <li key={iso}>
                <button
                  type="button"
                  aria-pressed={focus === iso}
                  onClick={() => pin(iso)}
                >
                  {countryName(iso)} <b>{s.out + s.in}</b>
                </button>
              </li>
            ))}
          </ol>
        ) : (
          <p className="empty">The sky is quiet. Planes land here as soon as someone replies.</p>
        )}
        <p className="colophon">Tap a country to meet who’s posting from there. <a href="/traffic">Air traffic →</a></p>

        {log.pilot && (
          <>
            <h2>Flight log</h2>
            <dl className="log">
              <div>
                <dt>Flown so far</dt>
                <dd><b>{km(log.km)}</b> {(log.km / (2 * Math.PI * EARTH_KM)).toFixed(1)}× around the Earth</dd>
              </div>
              {log.longest && (
                <div>
                  <dt>Longest flight</dt>
                  <dd><b>{km(log.longest.km)}</b> @{log.longest.plane.from_handle} → @{log.longest.plane.to_handle}, {routeName(routeKey(log.longest.plane))}</dd>
                </div>
              )}
              <div>
                <dt>Top pilot</dt>
                <dd>
                  <b><a href={`https://x.com/${log.pilot.handle}`} target="_blank" rel="noopener">@{log.pilot.handle}</a></b>
                  {log.pilot.count} {log.pilot.count === 1 ? 'plane' : 'planes'}
                </dd>
              </div>
              {log.route && (
                <div>
                  <dt>Busiest route</dt>
                  <dd><b>×{log.route.count}</b> {routeName(log.route.key)}</dd>
                </div>
              )}
            </dl>
          </>
        )}
      </section>
    </>
  )
}

// табло прилётов: бегущая строка под картой, последние реплаи — живой поток настоящих людей
function Arrivals({ planes }: { planes: PlaneRow[] }) {
  const items = planes.map((p) => (
    <li key={p.id} style={{ '--ink': userInk(p.from_handle) } as React.CSSProperties}>
      <svg className="icon dart-icon" viewBox="-11 -10 25 17" aria-hidden="true">
        <path d="M13 0 L-10 -9 L-4 0 Z" />
        <path d="M13 0 L-4 0 L-9 6 Z" />
      </svg>
      <b>@{p.from_handle}</b> → @{p.to_handle}
      <span className="leg">{countryName(countryOf(p.from_country))} → {countryName(countryOf(p.to_country))}</span>
      {p.created_at && <time dateTime={p.created_at}>{timeAgo(p.created_at)}</time>}
    </li>
  ))
  return (
    <section className="arrivals" aria-label="Latest arrivals">
      <h2>Arrivals</h2>
      {planes.length > 0 && (
        <div className="ticker">
          {/* лента дублируется, чтобы бежать по кругу без шва */}
          <ul>{items}</ul>
          <ul aria-hidden="true">{items}</ul>
        </div>
      )}
      <Live />
    </section>
  )
}

// модели самолётиков: у всех бумажный дротик, донатеры выбирают свою (все смотрят носом по +x)
export function Airframe({ model }: { model: PlaneModel }) {
  switch (model) {
    case 'glider':
      return (
        <>
          <path className="wing" d="M15 0 L-9 -1.6 L-9 1.6 Z" />
          <path className="wing" d="M3 -1 L-1 -14 L-5 -14 L-4 -1 Z" />
          <path className="wing" d="M3 1 L-1 14 L-5 14 L-4 1 Z" />
          <path className="fold" d="M-6 -1 L-10 -5 L-11 -5 L-9 0 L-11 5 L-10 5 L-6 1 Z" />
        </>
      )
    case 'swallow':
      return (
        <>
          <path className="wing" d="M14 0 L-2 -11 L-13 -13 L-5 -2 L-13 5 L-2 4 Z" />
          <path className="fold" d="M14 0 L-5 -2 L-13 5 L-2 4 Z" />
        </>
      )
    case 'crane':
      return (
        <>
          <path className="wing" d="M4 0 L-3 -14 L-6 0 Z" />
          <path className="wing" d="M15 -5 L3 1 L-6 1 L-15 -4 L-7 4 L5 4 Z" />
          <path className="fold" d="M4 0 L-2 9 L-6 1 Z" />
        </>
      )
    default:
      return (
        <>
          <path className="wing" d="M13 0 L-10 -9 L-4 0 Z" />
          <path className="wing" d="M13 0 L-4 0 L-9 6 Z" />
          <path className="fold" d="M13 0 L-4 0 L-9 6 Z" />
        </>
      )
  }
}

function arc(a: Point, b: Point) {
  return a === b ? null : path({ type: 'LineString', coordinates: [a, b] })
}

// аватарки только с домена X — url приходит из нашей базы, но лишний раз не доверяем
const avatarOf = (url?: string | null) => (url?.startsWith('https://pbs.twimg.com/') ? url : null)

// lead — чьи самолётики крупнее: зрителя или пилота с карточки /p
function FlightView({ f, hit, me, lead }: { f: Flight; hit: boolean; me: string | null; lead: string | null }) {
  const root = useRef<SVGGElement>(null)
  // полёт и проявление/угасание — на одних SMIL-часах. Раньше прозрачность жила в CSS-анимации:
  // в фоновой вкладке часы расходились, и по возвращении самолётик висел видимым в точке прилёта
  useEffect(() => {
    root.current?.querySelectorAll<SVGAnimationElement>('animate, animateMotion').forEach((a) => a.beginElement())
  }, [])

  const [bx, by] = projection(f.b)!
  const d = arc(f.a, f.b)
  const dur = flightSeconds(f.a, f.b)
  // у каждого пилота своя краска
  const style = { '--dur': `${dur.toFixed(2)}s`, '--ink': userInk(f.from_handle) } as React.CSSProperties
  const mine = !!lead && f.from_handle === lead
  const forMe = !!me && f.to_handle === me && !mine
  const cls = `flight${hit ? ' hit' : ''}${f.echo ? ' echo' : ''}${mine ? ' mine' : ''}${forMe ? ' for-me' : ''}${f.from_patron ? ' patron' : ''}`
  // ленточка с хэндлом — у свежих, у своих и у летящих к тебе; эхо летит одной аватаркой
  const banner = !f.echo || mine || forMe
  const avatar = avatarOf(f.from_avatar)
  const motion = { dur: `${dur.toFixed(2)}s`, begin: 'indefinite', fill: 'freeze' as const, path: d ?? '', keyPoints: '0;1', keyTimes: '0;1', calcMode: 'spline' as const, keySplines: EASE }
  const fade = (peak: number) => (
    <animate attributeName="opacity" values={`0;${peak};${peak};0`} keyTimes="0;.06;.94;1" dur={motion.dur} begin="indefinite" fill="freeze" />
  )

  // одна страна — самолётик не летит, просто штамп на месте
  if (!d) return <circle className={cls + ' stamp'} cx={bx} cy={by} r={4} style={{ '--dur': '0s', '--ink': userInk(f.from_handle) } as React.CSSProperties} />

  const mask = `reveal-${f.key}`
  return (
    <g className={cls} style={style} ref={root}>
      {!f.echo && (
        <>
          <mask id={mask} maskUnits="userSpaceOnUse">
            <path d={d} pathLength={1} className="reveal" />
          </mask>
          <path d={d} className="trail" mask={`url(#${mask})`} />
        </>
      )}
      <g className="plane" opacity={0}>
        <animateMotion rotate="auto" {...motion} />
        {fade(1)}
        <g className="dart">
          <Airframe model={f.from_patron && isPlaneModel(f.from_plane) ? f.from_plane : 'dart'} />
        </g>
      </g>
      {/* пилот и ленточка не поворачиваются вместе с самолётиком — лицо и текст всегда ровно */}
      <g className="pilot" opacity={0}>
        <animateMotion rotate="0" {...motion} />
        {fade(f.echo ? .85 : 1)}
        {avatar ? (
          <image className="face" href={avatar} x={-5} y={-19} width={10} height={10} clipPath="url(#round-sky)" />
        ) : (
          <circle className="face-blank" cy={-14} r={4.5} />
        )}
        <circle className="face-ring" cy={-14} r={5.2} />
        {banner && (
          <text className="banner" x={8} y={-11}>
            {`@${f.from_handle}${f.count > 1 ? ` ×${f.count}` : ''}${forMe ? ' → you' : ''}`}
          </text>
        )}
      </g>
      {!f.echo && <circle className="stamp" cx={bx} cy={by} r={4} />}
    </g>
  )
}

// местные: залогиненные пилоты стоят толпой у себя в стране. Статика — ни одной анимации на кадр
const CROWD = 9
// радиус аватарки в единицах карты (ширина карты — 1000), как у пилота в самолётике
const FACE = 4.6
function Locals({ people, me }: { people: Local[]; me: string | null }) {
  const crowds = useMemo(() => {
    const m = new Map<string, Local[]>()
    for (const u of people) {
      if (u.spot) continue
      const list = m.get(u.country) ?? []
      // ты — в центре своей толпы
      if (u.handle === me) list.unshift(u)
      else list.push(u)
      m.set(u.country, list)
    }
    return [...m]
  }, [people, me])

  const face = (u: Local) => {
    const avatar = avatarOf(u.image)
    return (
      <>
        <circle className="local-shade" cx={1.2} cy={1} r={FACE + .3} />
        {avatar ? <image href={avatar} x={-FACE} y={-FACE} width={2 * FACE} height={2 * FACE} clipPath="url(#round)" /> : <circle className="face-blank" r={FACE} />}
        <circle className="face-ring" r={FACE + .2} />
      </>
    )
  }
  const cls = (u: Local) => `local${u.patron ? ' patron' : ''}${u.handle === me ? ' mine' : ''}`
  const ink = (u: Local) => ({ '--ink': userInk(u.handle) }) as React.CSSProperties

  return (
    <g className="locals" aria-hidden="true">
      {/* кто отметил, где живёт, стоит там — к нему и летят его самолётики */}
      {people.filter((u) => u.spot).map((u) => {
        const [x, y] = projection(u.spot!)!
        return (
          <g key={u.handle} className={cls(u)} transform={`translate(${x.toFixed(1)} ${y.toFixed(1)})`} style={ink(u)}>
            {face(u)}
            {u.handle === me && <text className="local-you" y={-FACE - 2.5}>you live here</text>}
          </g>
        )
      })}
      {crowds.map(([iso, list]) => {
        const [cx, cy] = projection(at(iso))!
        const shown = list.slice(0, CROWD)
        const rest = list.length - shown.length
        // подсолнух: каждый следующий на золотом угле, чуть дальше от центра — плотно и без наложений
        const spot = (i: number) => [1.7 * FACE * Math.sqrt(i) * Math.cos(i * 2.4), 1.7 * FACE * Math.sqrt(i) * Math.sin(i * 2.4)]
        const edge = 1.7 * FACE * Math.sqrt(shown.length) + FACE
        return (
          <g key={iso} transform={`translate(${cx.toFixed(1)} ${cy.toFixed(1)})`}>
            {shown.map((u, i) => {
              const [x, y] = spot(i)
              return (
                <g key={u.handle} className={cls(u)} transform={`translate(${x.toFixed(1)} ${y.toFixed(1)})`} style={ink(u)}>
                  {face(u)}
                </g>
              )
            })}
            {rest > 0 && <text className="local-more" x={edge - FACE / 2} y={2.5}>+{rest}</text>}
            {shown[0]?.handle === me && <text className="local-you" y={-edge - 1.5}>you live here</text>}
          </g>
        )
      })}
    </g>
  )
}

function CountryCard({ iso, sky, svg, spread, onClose }: {
  iso: string; sky: Sky; onClose: () => void
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
    const cardW = card.current.offsetWidth
    const cardH = card.current.offsetHeight
    const left = cx > box.width * 0.55 ? cx - cardW - 24 : cx + 24
    card.current.style.left = `${Math.max(12, Math.min(left, box.width - cardW - 12))}px`
    // не заезжаем на шапку листа
    const floor = (el.parentElement?.offsetTop ?? 0) + 12
    card.current.style.top = `${Math.max(floor, Math.min(cy - cardH / 2, box.height - cardH - 56))}px`
    card.current.style.visibility = 'visible'
  }, [iso, svg, spread])

  return (
    <aside className="card" ref={card} style={{ visibility: 'hidden' }} aria-live="polite">
      <button className="close" onClick={onClose} aria-label="Close"><Close /></button>
      <h2>{countryName(iso)}</h2>
      <p className="tally"><b>{out}</b> out · <b>{s?.in ?? 0}</b> in</p>
      {iso === UNKNOWN && <p className="note">Where planes from unknown places land.</p>}
      {people.length ? (
        <>
          <ul className="people">
            {people.slice(0, 3).map(([h]) => (
              <li key={h} style={{ '--ink': userInk(h) } as React.CSSProperties}>
                <a href={`https://x.com/${h}`} target="_blank" rel="noopener noreferrer">@{h}</a>
              </li>
            ))}
            {people.length > 3 && <li className="more">+{people.length - 3}</li>}
          </ul>
          <p className="dests">
            → {s!.destinations.slice(0, 3).map(([c, n], i) => <span key={c}>{i > 0 && ', '}{countryName(c)} <b>{n}</b></span>)}
          </p>
        </>
      ) : (
        <p className="note">No planes from here yet.</p>
      )}
    </aside>
  )
}
