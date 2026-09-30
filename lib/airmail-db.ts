import { pool } from './db.ts'
import { planeRows } from './pilot-db.ts'
import { tally, type CountryWeather, type Letter, type Sky } from './airmail.ts'
import { isKind } from './letters.ts'
import type { PlaneRow } from './sky.ts'
import type { Stamp } from './pilot.ts'
import { dayNumber, rng } from './postcard.ts'

const toLetter = (p: PlaneRow): Letter => ({
  id: p.id, from_handle: p.from_handle, to_handle: p.to_handle, to_country: p.to_country, from_country: p.from_country,
  created_at: p.created_at, kind: isKind(p.kind) ? p.kind : null,
})

// живое небо игры: свежие чужие реплаи с известными странами — летят по своим маршрутам, их можно поймать
const toSky = (rows: PlaneRow[]): Sky[] =>
  rows.filter((p) => p.from_country && p.to_country && p.from_country !== p.to_country).slice(0, 60)
    .map((p) => ({ from_handle: p.from_handle, to_handle: p.to_handle, from_country: p.from_country, to_country: p.to_country }))

// начало сегодняшнего дня по Нью-Йорку: всё, что прилетело раньше, — общий «мешок дня», он не меняется до полуночи
const DAY_START = `(date_trunc('day', now() at time zone 'America/New_York') at time zone 'America/New_York')`

// погода: настроение разговоров по странам — и откуда реплай, и куда. Неделя до `until`, а если стран мало — всё время.
// until — только наши SQL-константы, не ввод юзера
export async function weatherRows(until = 'now()'): Promise<CountryWeather[]> {
  const q = (since: string) => pool.query<CountryWeather>(
    `select iso, count(*) filter (where kind = 'hot')::int as hot, count(*) filter (where kind = 'warm')::int as warm, count(*)::int as total
     from (select from_country as iso, kind, created_at from planes union all select to_country, kind, created_at from planes) c
     where iso is not null and created_at < ${until} and created_at > ${until} - $1::interval group by iso`, [since])
  const week = await q('7 days')
  return (week.rows.length >= 5 ? week : await q('100 years')).rows
}

// письма с известной страной адресата вперёд: мешок из одних «в Антарктиду» скучный — туда одно, для шутки про пингвинов.
// Письма, которые Jev разметил (💌 🔥 😂 ❓), — первыми: они летают по-разному, в этом и игра
const labeled = (p: PlaneRow) => (isKind(p.kind) && p.kind !== 'plain' ? 0 : 1)
function pickLetters(rows: PlaneRow[], n: number): Letter[] {
  const known = rows.filter((p) => p.to_country).sort((a, b) => labeled(a) - labeled(b))
  const fog = rows.filter((p) => !p.to_country).slice(0, known.length >= 4 ? 1 : 6 - known.length)
  return [...known.slice(0, n - fog.length), ...fog].map(toLetter)
}

// «Today's Mail #N»: один мешок на всех на день — самолётики до полуночи по Нью-Йорку, перемешанные сидом дня
export async function dailyBag() {
  const day = dayNumber()
  const [before, weather] = await Promise.all([planeRows(`p.created_at < ${DAY_START}`, [], 500), weatherRows(DAY_START)])
  const r = rng(day * 7919)
  const shuffled = before.map((p) => ({ p, k: r() })).sort((a, b) => a.k - b.k).map(({ p }) => p)
  const letters = pickLetters(shuffled, 12)
  return { guest: true, daily: day, handle: null, home: null, homeCountry: null, letters, weather, sky: toSky(shuffled), bag: tally(letters) }
}

// залогиненный: его реплаи и реплаи ему, 20 свежих
export async function userBag(userId: string) {
  const { rows: [u] } = await pool.query(
    `select u.handle, u.country, u.spot_lon, u.spot_lat, u."sinceId" as since_id, a."accountId" as x_id
     from "user" u join account a on a."userId" = u.id and a."providerId" = 'twitter' where u.id = $1`, [userId])
  if (!u) return null
  const [rows, weather, recent] = await Promise.all([
    planeRows('(p.from_x_id = $1 or p.to_x_id = $1)', [u.x_id], 100), weatherRows(), planeRows('p.from_x_id <> $1', [u.x_id], 300),
  ])
  const letters = pickLetters(rows, 20)
  const home: [number, number] | null = u.spot_lon != null ? [u.spot_lon, u.spot_lat] : null
  const sky = toSky(recent.sort(() => Math.random() - 0.5))
  // since_id пуст — реплаи юзера ещё ни разу не собирали: игра подождёт их
  return { guest: false, collecting: !u.since_id, handle: u.handle as string | null, home, homeCountry: u.country as string | null, letters, weather, sky, bag: tally(letters) }
}

// штамп только за своё письмо (отправитель или адресат) и один раз
export async function stamp(userId: string, planeId: number): Promise<boolean> {
  const { rowCount } = await pool.query(
    `insert into airmail (user_id, plane_id, country)
     select $1, p.id, coalesce(case when tu.id is not null then tu.country else p.to_country end, 'AQ')
     from planes p
     join account a on a."userId" = $1 and a."providerId" = 'twitter' and a."accountId" in (p.from_x_id, p.to_x_id)
     left join account ta on ta."providerId" = 'twitter' and ta."accountId" = p.to_x_id
     left join "user" tu on tu.id = ta."userId"
     where p.id = $2
     on conflict do nothing`, [userId, planeId])
  return !!rowCount
}

export async function airmailStampsOf(userId: string): Promise<Stamp[]> {
  const { rows } = await pool.query(
    `select country, count(*)::int as count, min(delivered_at) as first from airmail where user_id = $1 group by 1 order by 3`, [userId])
  return rows.map((r) => ({ ...r, first: new Date(r.first).toISOString() }))
}
