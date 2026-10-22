import { issueTicket, TICKET_SECRET } from '@/lib/wars-ticket'
import { clientIp, limited } from '@/lib/ratelimit'

// старт забега: билет, без которого заявка Mail Wars в конце не примется. Кэшировать нельзя — у каждого свой
export async function POST(req: Request) {
  if (await limited(`ticket-ip:${clientIp(req)}`, 60, 3600)) return new Response(null, { status: 429 })
  return Response.json({ ticket: issueTicket(TICKET_SECRET) }, { headers: { 'Cache-Control': 'private, no-store' } })
}
