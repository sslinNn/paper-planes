export type PlaneRow = { id: number; from_handle: string; to_handle: string; from_country: string | null; to_country: string | null }
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
