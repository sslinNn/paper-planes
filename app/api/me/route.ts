import { after } from 'next/server'
import { headers } from 'next/headers'
import { auth } from '@/lib/auth'
import { collect } from '@/lib/collect'
import { isCountry } from '@/lib/country'
import { inCountry } from '@/lib/geo'
import { isPlaneModel } from '@/lib/patrons'
import { pool } from '@/lib/db'
import { syncDonations } from '@/lib/donations'

const session = async () => auth.api.getSession({ headers: await headers() })

export async function GET(req: Request) {
  const s = await session()
  if (!s) return new Response(null, { status: 401 })
  // вернулись с оплаты: сначала сверяемся с lava.top, чтобы золото появилось сразу, не дожидаясь вебхука
  if (new URL(req.url).searchParams.has('sync')) await syncDonations().catch((e) => console.error('lava sync', e))
  const { rows } = await pool.query(`select handle, country, image, plane, "sinceId" as since_id, spot_lon, spot_lat,
       (select min(paid_at) from patrons where user_id = "user".id) as patron_since
     from "user" where id = $1`, [s.user.id])
  const me = rows[0]
  if (!me.since_id) after(() => collect(s.user.id)) // новый юзер — сразу собрать его реплаи
  // паспорт: страны, куда долетели мои самолётики, с датой первого прилёта
  const { rows: stamps } = await pool.query(
    `select coalesce(case when tu.id is not null then tu.country else p.to_country end, 'AQ') as country,
            count(*)::int as count, min(p.created_at) as first
     from planes p join account a on a."accountId" = p.from_x_id and a."providerId" = 'twitter'
     left join account ta on ta."providerId" = 'twitter' and ta."accountId" = p.to_x_id
     left join "user" tu on tu.id = ta."userId"
     where a."userId" = $1
     group by 1 order by min(p.created_at)`, [s.user.id])
  return Response.json({
    handle: me.handle, country: me.country, image: me.image, stamps,
    spot: me.spot_lon == null ? null : [me.spot_lon, me.spot_lat],
    patronSince: me.patron_since, plane: me.plane ?? 'dart',
    donations: !!(process.env.LAVA_API_KEY && process.env.LAVA_OFFER_ID),
  })
}

export async function POST(req: Request) {
  const s = await session()
  if (!s) return new Response(null, { status: 401 })
  const body = await req.json().catch(() => null)
  // модель самолётика — только для донатеров
  if (body && typeof body === 'object' && 'plane' in body) {
    if (!isPlaneModel(body.plane)) return new Response('bad plane', { status: 400 })
    const { rowCount } = await pool.query(
      `update "user" set plane = $1 where id = $2 and exists (select 1 from patrons where user_id = $2)`, [body.plane, s.user.id])
    return new Response(null, { status: rowCount ? 204 : 403 })
  }
  // точка внутри своей страны: [долгота, широта] или null — убрать
  if (body && typeof body === 'object' && 'spot' in body) {
    const { spot } = body
    const ok = spot === null || (Array.isArray(spot) && spot.length === 2 && spot.every(Number.isFinite))
    if (!ok) return new Response('bad spot', { status: 400 })
    // точку видят все — храним с точностью до 0.1° (~10 км), не до подъезда
    const at = spot && (spot.map((v: number) => Math.round(v * 10) / 10) as [number, number])
    const { rows: [u] } = await pool.query(`select country from "user" where id = $1`, [s.user.id])
    if (at && !(u?.country && inCountry(u.country, at))) return new Response('spot outside your country', { status: 400 })
    await pool.query(`update "user" set spot_lon = $1, spot_lat = $2 where id = $3`, [at?.[0] ?? null, at?.[1] ?? null, s.user.id])
    return Response.json({ spot: at })
  }
  if (!body || typeof body !== 'object' || !('country' in body)) return new Response('bad body', { status: 400 })
  const { country } = body
  if (country !== null && !isCountry(country)) return new Response('bad country', { status: 400 })
  await pool.query(`update "user" set country = $1, "countryManual" = true, spot_lon = null, spot_lat = null where id = $2`, [country, s.user.id])
  return new Response(null, { status: 204 })
}
