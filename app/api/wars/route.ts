import { headers } from 'next/headers'
import { auth } from '@/lib/auth'
import { pool } from '@/lib/db'
import { claimRequest, ticketFits, TICKET_TTL_MS } from '@/lib/wars'
import { readTicket, TICKET_SECRET } from '@/lib/wars-ticket'
import { claim, warState } from '@/lib/wars-db'
import { clientIp, limited } from '@/lib/ratelimit'

export async function GET() {
  return Response.json(await warState(), { headers: { 'Cache-Control': 'public, s-maxage=10, stale-while-revalidate=60' } })
}

// конец забега: доставленные страны переходят под флаг пилота. Вошедший воюет за страну из профиля, гость — за выбранный флаг.
// Заявка живёт только с билетом, выданным на старте забега (/api/wars/ticket): иначе скрипт красит мир одним запросом,
// а глобус на /sky показывает это как «игроки только что приземлили»
export async function POST(req: Request) {
  const raw = await req.json().catch(() => null)
  const body = claimRequest(raw)
  if (!body) return new Response('bad claim', { status: 400 })
  const ticket = readTicket((raw as { ticket?: unknown }).ticket, TICKET_SECRET)
  if (!ticket || !ticketFits(ticket.iat, Date.now(), body.letters)) return new Response('no run behind this claim', { status: 403 })
  if (await limited(`wars:${clientIp(req)}`, 20, 3600)) return new Response(null, { status: 429 })
  // билет одноразовый: второй раз тот же забег не засчитывается
  if (await limited(`ticket:${ticket.nonce}`, 1, TICKET_TTL_MS / 1000)) return new Response('ticket used', { status: 409 })
  const s = await auth.api.getSession({ headers: await headers() })
  if (s) {
    const { rows: [u] } = await pool.query(`select country from "user" where id = $1`, [s.user.id])
    if (u?.country) body.nation = u.country
  }
  await claim(body.nation, body.claims)
  return new Response(null, { status: 204 })
}
