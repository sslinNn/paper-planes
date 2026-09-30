import { pool } from './db.ts'
import { empires, rulers, worldEvent, type Claim } from './wars.ts'

export async function claim(nation: string, claims: [string, number][]) {
  await pool.query(
    `insert into wars (nation, country, n) select $1, c, n from unnest($2::text[], $3::int[]) as t(c, n)`,
    [nation, claims.map(([c]) => c), claims.map(([, n]) => n)])
}

// состояние войны за неделю + событие часа из настоящего трафика реплаев
export async function warState() {
  const [claims, feed, traffic] = await Promise.all([
    pool.query(`select nation, country, sum(n)::int as n from wars where created_at > now() - interval '7 days' group by 1, 2`),
    pool.query(`select nation, country, n, created_at as at from wars order by id desc limit 12`),
    pool.query(
      `select to_country as country, count(*)::int as n, count(*) filter (where kind = 'hot')::int as hot
       from planes where created_at > now() - interval '30 days' and to_country is not null
       group by 1 order by n desc limit 5`),
  ])
  const r = rulers(claims.rows as Claim[])
  return {
    rulers: [...r].map(([country, { nation, n }]) => [country, nation, n] as [string, string, number]),
    empires: empires(r).slice(0, 5),
    feed: feed.rows as { nation: string; country: string; n: number; at: string }[],
    event: worldEvent(traffic.rows, Date.now()),
  }
}
export type WarState = Awaited<ReturnType<typeof warState>>
