import { after } from 'next/server'
import { headers } from 'next/headers'
import { auth } from '@/lib/auth'
import { collect } from '@/lib/collect'
import { isCountry } from '@/lib/country'
import { inCountry } from '@/lib/geo'
import { isPlaneModel } from '@/lib/patrons'
import { pool } from '@/lib/db'
import { stampsOf } from '@/lib/pilot-db'
import { airmailStampsOf, xpOf } from '@/lib/airmail-db'
import { unlocked } from '@/lib/ranks'
import { syncDonations } from '@/lib/donations'
import { limited } from '@/lib/ratelimit'

const session = async () => auth.api.getSession({ headers: await headers() })

export async function GET(req: Request) {
  const s = await session()
  if (!s) return new Response(null, { status: 401 })
  // вернулись с оплаты: сначала сверяемся с lava.top, чтобы золото появилось сразу, не дожидаясь вебхука
  // страница оплаты опрашивает раз в 5 с ≈ 13 раз; 15 за 10 минут хватает ей, но не циклу, который жжёт наш ключ lava
  if (new URL(req.url).searchParams.has('sync') && !(await limited(`sync:${s.user.id}`, 15, 600)))
    await syncDonations().catch((e) => console.error('lava sync', e))
  const { rows } = await pool.query(`select handle, country, image, plane, "sinceId" as since_id, spot_lon, spot_lat,
       (select min(paid_at) from patrons where user_id = "user".id) as patron_since
     from "user" where id = $1`, [s.user.id])
  const me = rows[0]
  if (!me.since_id) after(() => collect(s.user.id)) // новый юзер — сразу собрать его реплаи
  const [stamps, airmail, xp] = await Promise.all([stampsOf(s.user.id), airmailStampsOf(s.user.id), xpOf(s.user.id)])
  return Response.json({
    handle: me.handle, country: me.country, image: me.image, stamps, airmail, xp,
    spot: me.spot_lon == null ? null : [me.spot_lon, me.spot_lat],
    patronSince: me.patron_since, plane: me.plane ?? 'dart',
    donations: !!(process.env.LAVA_API_KEY && process.env.LAVA_OFFER_ID),
  })
}

export async function POST(req: Request) {
  const s = await session()
  if (!s) return new Response(null, { status: 401 })
  const body = await req.json().catch(() => null)
  // модель самолётика открывается рангом пилота в AIRMAIL (писем доставлено за все забеги)
  if (body && typeof body === 'object' && 'plane' in body) {
    if (!isPlaneModel(body.plane)) return new Response('bad plane', { status: 400 })
    if (!unlocked(await xpOf(s.user.id), body.plane)) return new Response('locked', { status: 403 })
    await pool.query(`update "user" set plane = $1 where id = $2`, [body.plane, s.user.id])
    return new Response(null, { status: 204 })
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
