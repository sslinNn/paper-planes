export type PlaneRow = {
  id: number; from_handle: string; to_handle: string; from_country: string | null; to_country: string | null
  from_avatar?: string | null
}
export type CountrySky = { out: number; in: number; people: [string, number][]; destinations: [string, number][] }

// неизвестная страна — Антарктида
export const UNKNOWN = 'AQ'
export const countryOf = (c: string | null) => c ?? UNKNOWN

const ranked = (m: Map<string, number>) => [...m].sort((a, b) => b[1] - a[1])

export function summarize(planes: PlaneRow[]): Map<string, CountrySky> {
  const acc = new Map<string, { out: number; in: number; people: Map<string, number>; dest: Map<string, number> }>()
  const get = (c: string) => {
    if (!acc.has(c)) acc.set(c, { out: 0, in: 0, people: new Map(), dest: new Map() })
    return acc.get(c)!
  }
  for (const p of planes) {
    const from = get(countryOf(p.from_country))
    const to = countryOf(p.to_country)
    from.out++
    from.people.set(p.from_handle, (from.people.get(p.from_handle) ?? 0) + 1)
    from.dest.set(to, (from.dest.get(to) ?? 0) + 1)
    get(to).in++
  }
  return new Map([...acc].map(([c, s]) => [c, { out: s.out, in: s.in, people: ranked(s.people), destinations: ranked(s.dest) }]))
}

export type Route = { key: string; lead: PlaneRow; count: number; senders: string[] }
export const routeKey = (p: PlaneRow) => `${countryOf(p.from_country)}>${countryOf(p.to_country)}`

// реплаи по одному маршруту склеиваются в один самолётик: ведёт самый свежий, на ленточке — сколько их
export function routes(planes: PlaneRow[]): Route[] {
  const acc = new Map<string, Route>()
  for (const p of planes) {
    const k = routeKey(p)
    const r = acc.get(k)
    if (!r) acc.set(k, { key: k, lead: p, count: 1, senders: [p.from_handle] })
    else {
      r.count++
      if (!r.senders.includes(p.from_handle)) r.senders.push(p.from_handle)
    }
  }
  return [...acc.values()].sort((a, b) => b.count - a.count)
}

// диспетчер неба: один самолётик на маршрут и не больше `max` в воздухе одновременно
export class Traffic {
  private air = new Map<string, number>()
  private max: number
  constructor(max: number) {
    this.max = max
  }
  takeoff(route: string, durMs: number, now = Date.now()): boolean {
    for (const [k, until] of this.air) if (until <= now) this.air.delete(k)
    if (this.air.has(route) || this.air.size >= this.max) return false
    this.air.set(route, now + durMs)
    return true
  }
}

// у каждого пилота своя краска: тон из хэша хэндла (FNV-1a), синий диапазон карты (200–260°) пропущен
export function userHue(handle: string): number {
  let h = 0x811c9dc5
  for (const c of handle.toLowerCase()) h = Math.imul(h ^ c.charCodeAt(0), 0x01000193)
  const hue = (h >>> 0) % 300
  return hue < 200 ? hue : hue + 60
}
export const userInk = (handle: string) => `oklch(0.7 0.19 ${userHue(handle)})`
