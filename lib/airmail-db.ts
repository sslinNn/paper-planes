import { pool } from './db.ts'
import { planeRows } from './pilot-db.ts'
import { tally, type CountryWeather, type Letter } from './airmail.ts'
import { isKind } from './letters.ts'
import type { PlaneRow } from './sky.ts'
import type { Stamp } from './pilot.ts'

const toLetter = (p: PlaneRow): Letter => ({
  id: p.id, from_handle: p.from_handle, to_handle: p.to_handle, to_country: p.to_country,
  created_at: p.created_at, kind: isKind(p.kind) ? p.kind : null,
})

// погода: настроение разговоров по странам — и откуда реплай, и куда. Неделя, а если стран мало — всё время
export async function weatherRows(): Promise<CountryWeather[]> {
  const q = (since: string) => pool.query<CountryWeather>(
    `select iso, count(*) filter (where kind = 'hot')::int as hot, count(*) filter (where kind = 'warm')::int as warm, count(*)::int as total
     from (select from_country as iso, kind from planes where created_at > now() - $1::interval
           union all select to_country, kind from planes where created_at > now() - $1::interval) c
     where iso is not null group by iso`, [since])
  const week = await q('7 days')
  return (week.rows.length >= 5 ? week : await q('100 years')).rows
}

// письма с известной страной адресата вперёд: мешок из одних «в Антарктиду» скучный — туда одно, для шутки про пингвинов
function pickLetters(rows: PlaneRow[], n: number): Letter[] {
  const known = rows.filter((p) => p.to_country)
  const fog = rows.filter((p) => !p.to_country).slice(0, known.length >= 4 ? 1 : 6 - known.length)
  return [...known.slice(0, n - fog.length), ...fog].map(toLetter)
}

// гость: 12 случайных из последних 500 самолётиков общего неба
export async function guestBag() {
  const [recent, weather] = await Promise.all([planeRows('true', [], 500), weatherRows()])
  const letters = pickLetters(recent.sort(() => Math.random() - 0.5), 12)
  return { guest: true, handle: null, home: null, homeCountry: null, letters, weather, bag: tally(letters) }
}

// залогиненный: его реплаи и реплаи ему, 20 свежих
export async function userBag(userId: string) {
  const { rows: [u] } = await pool.query(
    `select u.handle, u.country, u.spot_lon, u.spot_lat, a."accountId" as x_id
     from "user" u join account a on a."userId" = u.id and a."providerId" = 'twitter' where u.id = $1`, [userId])
  if (!u) return null
  const [rows, weather] = await Promise.all([planeRows('(p.from_x_id = $1 or p.to_x_id = $1)', [u.x_id], 100), weatherRows()])
  const letters = pickLetters(rows, 20)
  const home: [number, number] | null = u.spot_lon != null ? [u.spot_lon, u.spot_lat] : null
  return { guest: false, handle: u.handle as string | null, home, homeCountry: u.country as string | null, letters, weather, bag: tally(letters) }
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
