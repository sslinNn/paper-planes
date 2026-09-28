import { after } from 'next/server'
import { headers } from 'next/headers'
import { auth } from '@/lib/auth'
import { collect } from '@/lib/collect'
import { isCountry } from '@/lib/country'
import { pool } from '@/lib/db'

const session = async () => auth.api.getSession({ headers: await headers() })

export async function GET() {
  const s = await session()
  if (!s) return new Response(null, { status: 401 })
  const { rows } = await pool.query(`select handle, country, image, "sinceId" as since_id from "user" where id = $1`, [s.user.id])
  const me = rows[0]
  if (!me.since_id) after(() => collect(s.user.id)) // новый юзер — сразу собрать его реплаи
  // паспорт: страны, куда долетели мои самолётики, с датой первого прилёта
  const { rows: stamps } = await pool.query(
    `select coalesce(p.to_country, 'AQ') as country, count(*)::int as count, min(p.created_at) as first
     from planes p join account a on a."accountId" = p.from_x_id and a."providerId" = 'twitter'
     where a."userId" = $1
     group by 1 order by min(p.created_at)`, [s.user.id])
  return Response.json({ handle: me.handle, country: me.country, image: me.image, stamps })
}

export async function POST(req: Request) {
  const s = await session()
  if (!s) return new Response(null, { status: 401 })
  const body = await req.json().catch(() => null)
  if (!body || typeof body !== 'object' || !('country' in body)) return new Response('bad body', { status: 400 })
  const { country } = body
  if (country !== null && !isCountry(country)) return new Response('bad country', { status: 400 })
  await pool.query(`update "user" set country = $1, "countryManual" = true where id = $2`, [country, s.user.id])
  return new Response(null, { status: 204 })
}
