'use client'
import { useEffect, useRef, useState } from 'react'
import { at, FOG, H, land, path, projection, W } from '@/lib/geo'

type Plane = { id: number; from_handle: string; to_handle: string; from_country: string | null; to_country: string | null }
type Flight = Plane & { key: string }

const MAX_FLIGHTS = 200
const POLL_MS = 20_000
const [fogX, fogY] = projection(FOG)!

const fetchPlanes = (after: number): Promise<Plane[]> =>
  fetch(`/api/planes?after=${after}`).then((r) => (r.ok ? r.json() : []))

export default function PlaneMap() {
  const [flights, setFlights] = useState<Flight[]>([])

  useEffect(() => {
    let history: Plane[] = []
    let lastId = 0
    const timers: ReturnType<typeof setTimeout>[] = []
    const fly = (p: Plane) =>
      setFlights((f) => [...f.slice(-(MAX_FLIGHTS - 1)), { ...p, key: `${p.id}-${performance.now()}` }])

    const take = (planes: Plane[]) => {
      if (planes.length) lastId = Math.max(lastId, planes[0].id)
      history = [...planes, ...history].slice(0, MAX_FLIGHTS)
      return planes
    }

    fetchPlanes(0).then((planes) => take(planes).slice(0, 20).forEach(fly))

    // новые приходят пачкой — раскидываем вылеты по интервалу опроса
    const poll = setInterval(async () => {
      const fresh = take(await fetchPlanes(lastId))
      fresh.forEach((p, i) => timers.push(setTimeout(() => fly(p), (i * POLL_MS) / fresh.length)))
    }, POLL_MS)

    // карта не должна стоять: раз в 2.5 с перелетает случайный старый самолётик
    const replay = setInterval(() => history.length && fly(history[Math.floor(Math.random() * history.length)]), 2500)

    return () => {
      clearInterval(poll)
      clearInterval(replay)
      timers.forEach(clearTimeout)
    }
  }, [])

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="map" role="img" aria-label="World map of X replies">
      <path d={path({ type: 'Sphere' })!} className="ocean" />
      {land.map((f, i) => <path key={i} d={path(f)!} className="land" />)}
      <circle cx={fogX} cy={fogY} r={12} className="fog"><title>Unknown country</title></circle>
      {flights.map((p) => <FlightView key={p.key} p={p} />)}
    </svg>
  )
}

function FlightView({ p }: { p: Plane }) {
  const motion = useRef<SVGAnimateMotionElement>(null)
  useEffect(() => motion.current?.beginElement(), [])

  const a = at(p.from_country)
  const b = at(p.to_country)
  const label = `@${p.from_handle} → @${p.to_handle}`
  const d = a === b ? null : path({ type: 'LineString', coordinates: [a, b] })

  if (!d) {
    const [x, y] = projection(b)!
    return <circle cx={x} cy={y} r={4} className="pulse"><title>{label}</title></circle>
  }
  return (
    <g>
      <path d={d} className="trail"><title>{label}</title></path>
      <path className="plane" d="M7 0 L-6 -5 L-3 0 L-6 5 Z">
        <animateMotion ref={motion} dur="3s" begin="indefinite" fill="freeze" rotate="auto" path={d} />
      </path>
    </g>
  )
}
