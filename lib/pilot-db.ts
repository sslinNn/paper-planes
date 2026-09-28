import { pool } from './db.ts'
import type { PlaneRow } from './sky.ts'
import type { Stamp } from './pilot.ts'
import { WEEK_MIN } from './traffic.ts'

// паспорт: страны, куда долетели самолётики юзера, с датой первого прилёта
export async function stampsOf(userId: string): Promise<Stamp[]> {
  const { rows } = await pool.query(
    `select coalesce(case when tu.id is not null then tu.country else p.to_country end, 'AQ') as country,
            count(*)::int as count, min(p.created_at) as first
     from planes p join account a on a."accountId" = p.from_x_id and a."providerId" = 'twitter'
     left join account ta on ta."providerId" = 'twitter' and ta."accountId" = p.to_x_id
     left join "user" tu on tu.id = ta."userId"
     where a."userId" = $1
     group by 1 order by min(p.created_at)`, [userId])
  return rows.map((r) => ({ ...r, first: new Date(r.first).toISOString() }))
}

// самолётики для карты, новые сверху. where видит p (planes) и u (залогиненный отправитель)
export async function planeRows(where: string, params: unknown[], limit = 200): Promise<PlaneRow[]> {
  const { rows } = await pool.query(
    // страна в самолётике — снимок на момент сбора. У залогиненных берём текущую: юзер мог выбрать страну позже,
    // и его старые реплаи иначе так и летали бы из Антарктиды, пока он сам стоит в Индии
    `select p.id, p.from_handle, p.to_handle,
            case when u.id is not null then u.country else p.from_country end as from_country,
            case when tu.id is not null then tu.country else p.to_country end as to_country,
            u.image as from_avatar, p.created_at,
            u.plane as from_plane, exists (select 1 from patrons pt where pt.user_id = u.id) as from_patron
     from planes p
     left join account a on a."providerId" = 'twitter' and a."accountId" = p.from_x_id
     left join "user" u on u.id = a."userId"
     left join account ta on ta."providerId" = 'twitter' and ta."accountId" = p.to_x_id
     left join "user" tu on tu.id = ta."userId"
     where ${where} order by p.id desc limit ${Math.trunc(limit)}`, params)
  return rows
}

// публичная карточка пилота: только то, что и так видно на карте — хэндл, аватар, страны
export async function pilot(handle: string) {
  const { rows: [u] } = await pool.query(
    `select id, handle, image, country from "user" where lower(handle) = lower($1) limit 1`, [handle])
  if (!u) return null
  const [stamps, planes] = await Promise.all([stampsOf(u.id), planeRows('u.id = $1', [u.id])])
  return { handle: u.handle as string, image: u.image as string | null, country: u.country as string | null, stamps, planes }
}

// рейсы для табло /traffic: неделя, а если за неделю пусто — всё время.
// ponytail: потолок 5000 строк и агрегация в JS; когда самолётиков станут сотни тысяч — group by в SQL
export async function trafficRows() {
  const week = await planeRows(`p.created_at > now() - interval '7 days'`, [], 5000)
  if (week.length >= WEEK_MIN) return { planes: week, window: 'week' as const }
  return { planes: await planeRows('true', [], 5000), window: 'all' as const }
}
