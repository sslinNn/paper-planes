import { countryName } from './country.ts'
import { countryOf, flightLog, routes, summarize, UNKNOWN, type PlaneRow } from './sky.ts'

// табло /traffic: спокойная статистика неба, без «кто кого»
export const WEEK_MIN = 20 // меньше за неделю — табло пустое, показываем всё время
const DAY = 86_400_000

// Антарктида на карте — «страна неизвестна», на табло так и пишем
export const placeName = (iso: string) => (iso === UNKNOWN ? 'Somewhere unknown' : countryName(iso))

export function board(planes: PlaneRow[], kmOf: (p: PlaneRow) => number, now = Date.now()) {
  // «неизвестно» — получатель без локации: в общем счёте есть, но в рейтингах это не место
  const known = planes.filter((p) => p.from_country && p.to_country)
  const skies = [...summarize(known)]
    .map(([iso, s]) => ({ iso, out: s.out, in: s.in, total: s.out + s.in }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 10)
  // куда за сутки прилетело больше всего; неизвестную страну не выбираем — это не место
  const landed = new Map<string, number>()
  for (const p of planes) {
    const to = countryOf(p.to_country)
    if (to !== UNKNOWN && now - new Date(p.created_at ?? 0).getTime() < DAY) landed.set(to, (landed.get(to) ?? 0) + 1)
  }
  const [day] = [...landed].sort((a, b) => b[1] - a[1])
  return {
    planes: planes.length,
    routes: routes(known).slice(0, 10).map((r) => ({ key: r.key, count: r.count, pilots: r.senders.length })),
    skies,
    landingOfDay: day ? { iso: day[0], count: day[1] } : null,
    longest: flightLog(planes, kmOf).longest,
  }
}

export type Board = ReturnType<typeof board>

// флаг из ISO-кода (региональные индикаторы); у неизвестной страны флага нет — туман
export const flag = (iso: string) =>
  iso === UNKNOWN ? '🌫️' : String.fromCodePoint(...[...iso].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65))
