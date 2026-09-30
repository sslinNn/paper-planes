import { headers } from 'next/headers'
import { auth } from '@/lib/auth'
import { pool } from '@/lib/db'
import { claimRequest } from '@/lib/wars'
import { claim, warState } from '@/lib/wars-db'
import { clientIp, limited } from '@/lib/ratelimit'

export async function GET() {
  return Response.json(await warState(), { headers: { 'Cache-Control': 'public, s-maxage=10, stale-while-revalidate=60' } })
}

// конец забега: доставленные страны переходят под флаг пилота. Вошедший воюет за страну из профиля, гость — за выбранный флаг
export async function POST(req: Request) {
  const body = claimRequest(await req.json().catch(() => null))
  if (!body) return new Response('bad claim', { status: 400 })
  if (await limited(`wars:${clientIp(req)}`, 30, 3600)) return new Response(null, { status: 429 })
  const s = await auth.api.getSession({ headers: await headers() })
  if (s) {
    const { rows: [u] } = await pool.query(`select country from "user" where id = $1`, [s.user.id])
    if (u?.country) body.nation = u.country
  }
  await claim(body.nation, body.claims)
  return new Response(null, { status: 204 })
}
