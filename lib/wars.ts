// MAIL WARS: письма красят страны флагом отправителя. Чистая логика — без базы, чтобы проверялась тестами
export type Claim = { nation: string; country: string; n: number }
export type Ruler = { nation: string; n: number }
export type WorldEvent = { country: string; n: number; hot: number; until: number }

// riso-краски: у каждой нации своя, по хешу кода — одна и та же у всех игроков
export const INKS = ['#ff48b0', '#0078bf', '#ffe800', '#00a95c', '#ff6c2f', '#765ba7', '#00838a', '#ff4c65']
export const inkOf = (nation: string) => INKS[(nation.charCodeAt(0) * 31 + nation.charCodeAt(1)) % INKS.length]

export const isIso = (s: unknown): s is string => typeof s === 'string' && /^[A-Z]{2}$/.test(s) && s !== 'AQ'

// кто правит каждой страной: нация с наибольшим числом доставок туда
export function rulers(claims: Claim[]): Map<string, Ruler> {
  const sum = new Map<string, Map<string, number>>()
  for (const c of claims) {
    const by = sum.get(c.country) ?? new Map<string, number>()
    by.set(c.nation, (by.get(c.nation) ?? 0) + c.n)
    sum.set(c.country, by)
  }
  const out = new Map<string, Ruler>()
  for (const [country, by] of sum) {
    let best: Ruler | null = null
    for (const [nation, n] of by) if (!best || n > best.n || (n === best.n && nation < best.nation)) best = { nation, n }
    out.set(country, best!)
  }
  return out
}

// империи: сколько стран держит каждая нация
export function empires(r: Map<string, Ruler>): { nation: string; countries: number }[] {
  const n = new Map<string, number>()
  for (const { nation } of r.values()) n.set(nation, (n.get(nation) ?? 0) + 1)
  return [...n].map(([nation, countries]) => ({ nation, countries })).sort((a, b) => b.countries - a.countries || (a.nation < b.nation ? -1 : 1))
}

// потолок писем в одной заявке: обычный забег — 2–20 писем, бесконечный мешок свободного полёта даёт запас
export const MAX_CLAIM = 60
// билет на забег живёт меньше часа: одноразовость держит rate_limits, а их строки старше часа чистит сборщик
export const TICKET_TTL_MS = 55 * 60_000
// быстрее не долететь: письмо — это взлёт, курс и посадка, пара секунд минимум
export const minRunMs = (letters: number) => letters * 2000

// заявка с клиента: нация и счётчик доставок по странам. Сервер режет всё, что не похоже на один забег
export function claimRequest(body: unknown): { nation: string; claims: [string, number][]; letters: number } | null {
  if (!body || typeof body !== 'object') return null
  const { nation, countries } = body as { nation?: unknown; countries?: unknown }
  if (!isIso(nation) || !Array.isArray(countries) || !countries.length || countries.length > MAX_CLAIM) return null
  const n = new Map<string, number>()
  for (const c of countries) if (isIso(c)) n.set(c, (n.get(c) ?? 0) + 1)
  return n.size ? { nation, claims: [...n], letters: countries.length } : null
}

// билет выдан до забега: заявка без билета, со слишком свежим (не успел бы долететь) или протухшим — не забег
export const ticketFits = (issuedAt: number, now: number, letters: number) => {
  const age = now - issuedAt
  return age >= minRunMs(letters) && age <= TICKET_TTL_MS
}

// мировое событие часа: страна, куда сейчас летит больше всего настоящих реплаев. Из топа выбираем по номеру часа,
// чтобы событие менялось, но было одинаковым у всех. Письма туда — ×3 до конца часа
export function worldEvent(rows: { country: string; n: number; hot: number }[], now: number): WorldEvent | null {
  const top = rows.filter((r) => isIso(r.country)).slice(0, 5)
  if (!top.length) return null
  const hour = Math.floor(now / 3_600_000)
  const r = top[hour % top.length]
  return { ...r, until: (hour + 1) * 3_600_000 }
}
