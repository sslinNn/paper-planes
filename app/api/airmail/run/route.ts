import { headers } from 'next/headers'
import { auth } from '@/lib/auth'
import { saveRun } from '@/lib/airmail-db'
import { dayNumber } from '@/lib/postcard'
import { rankOf, runFits, runRequest } from '@/lib/ranks'
import { limited } from '@/lib/ratelimit'
import { readTicket, TICKET_SECRET } from '@/lib/wars-ticket'
import { TICKET_TTL_MS } from '@/lib/wars'

// конец забега залогиненного: опыт (ранг) и место в лидерборде дня
export async function POST(req: Request) {
  const s = await auth.api.getSession({ headers: await headers() })
  if (!s) return new Response(null, { status: 401 })
  const raw = await req.json().catch(() => null)
  const run = runRequest(raw, dayNumber())
  if (!run) return new Response('bad run', { status: 400 })
  // билет со старта забега (/api/wars/ticket): забег должен был длиться столько, сколько нужно на эти письма и километры
  const ticket = readTicket((raw as { ticket?: unknown }).ticket, TICKET_SECRET)
  if (!ticket || !runFits(ticket.iat, Date.now(), run)) return new Response('no run behind this score', { status: 403 })
  if (await limited(`run:${s.user.id}`, 30, 3600)) return new Response(null, { status: 429 })
  if (await limited(`run-ticket:${ticket.nonce}`, 1, TICKET_TTL_MS / 1000)) return new Response('run already counted', { status: 409 })
  const { xp, place } = await saveRun(s.user.id, run)
  return Response.json({ xp, rank: rankOf(xp).name, place })
}
