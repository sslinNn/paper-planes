import { after } from 'next/server'
import { collectIfDue } from '@/lib/collect'
import { pool } from '@/lib/db'

export async function GET(req: Request) {
  after(collectIfDue)
  // id — int4: мусор и числа больше 2^31 не должны ронять запрос
  const since = Math.min(Math.max(Math.trunc(Number(new URL(req.url).searchParams.get('after'))) || 0, 0), 2 ** 31 - 1)
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
     where p.id > $1 order by p.id desc limit 200`, [since])
  // CDN держит ответ 10 с: в наплыв все зрители делят один запрос в БД, а не бьют её каждые 20 с
  return Response.json(rows, { headers: { 'Cache-Control': 'public, s-maxage=10, stale-while-revalidate=30' } })
}
