import { headers } from 'next/headers'
import { auth } from '@/lib/auth'
import { donationRequest, UTM_SOURCE } from '@/lib/patrons'

// создаём счёт в lava.top; id юзера едет в utm_content и возвращается в вебхуке
export async function POST(req: Request) {
  const s = await auth.api.getSession({ headers: await headers() })
  if (!s) return new Response(null, { status: 401 })
  const { LAVA_API_KEY, LAVA_OFFER_ID } = process.env
  if (!LAVA_API_KEY || !LAVA_OFFER_ID) return new Response('donations are not set up yet', { status: 503 })

  const d = donationRequest(await req.json().catch(() => null))
  if (!d) return new Response('bad donation', { status: 400 })

  const origin = new URL(req.url).origin
  const r = await fetch('https://gate.lava.top/api/v3/invoice', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Api-Key': LAVA_API_KEY },
    body: JSON.stringify({
      email: d.email,
      offerId: LAVA_OFFER_ID,
      currency: d.currency,
      amount: d.amount,
      buyerLanguage: 'EN',
      clientUtm: { utm_source: UTM_SOURCE, utm_content: s.user.id },
      // lava.top принимает адреса возврата только по https — локально (http://127.0.0.1) их не передаём
      ...(origin.startsWith('https://') && {
        successful_return_url: `${origin}/me?thanks=1`,
        failure_return_url: `${origin}/me`,
        cancel_return_url: `${origin}/me`,
      }),
    }),
  })
  const j = await r.json().catch(() => null)
  if (!r.ok || !j?.paymentUrl) {
    console.error('lava invoice', r.status, j)
    return new Response('payment provider error', { status: 502 })
  }
  return Response.json({ url: j.paymentUrl })
}
