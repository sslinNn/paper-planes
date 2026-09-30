// открытка забега: сид дня («Today's Mail #N» — один маршрут на всех), флаги, код маршрута для ссылки и шер как у Wordle

// mulberry32: одинаковая последовательность для одного сида на любом устройстве
export function rng(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// день по Нью-Йорку (там дедлайн и полночь конкурса); #1 — день запуска
const LAUNCH = Date.UTC(2026, 8, 30)
const nyDate = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' })
export function dayNumber(now = new Date()) {
  const [y, m, d] = nyDate.format(now).split('-').map(Number)
  return Math.round((Date.UTC(y, m - 1, d) - LAUNCH) / 86400000) + 1
}

// флаг из ISO-кода: две буквы → региональные индикаторы
export const flag = (iso: string) =>
  /^[A-Z]{2}$/.test(iso) ? String.fromCodePoint(...[...iso].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65)) : '🌐'

export type Route = { score: number; km: number; countries: string[]; day: number | null }

// код для ссылки /play/r/<код>: счёт-км-страны[-день]. Только цифры и заглавные буквы — в OG-картинку попадает то, что прошло разбор
export const routeCode = (r: Route) =>
  [Math.round(r.score), Math.round(r.km), r.countries.slice(0, 20).join(''), ...(r.day ? [r.day] : [])].join('-')

export function parseRoute(code: string): Route | null {
  const m = /^(\d{1,7})-(\d{1,6})-((?:[A-Z]{2}){0,20})(?:-(\d{1,4}))?$/.exec(code)
  if (!m) return null
  return { score: Number(m[1]), km: Number(m[2]), countries: m[3].match(/../g) ?? [], day: m[4] ? Number(m[4]) : null }
}

// шер без спойлеров: номер дня, флаги стран в порядке доставки, горячие письма, счёт
export function dailyShare(o: { day: number; countries: string[]; score: number; hot: number; won: boolean }) {
  const flags = o.countries.length ? o.countries.map(flag).join('') : '📭'
  return [`✈️ Airmail #${o.day}`, flags + (o.won ? '🏁' : ''), ...(o.hot ? [`🔥×${o.hot}`] : []), Math.round(o.score).toLocaleString('en')].join(' · ')
}
