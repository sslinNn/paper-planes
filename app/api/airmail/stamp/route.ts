import { headers } from 'next/headers'
import { auth } from '@/lib/auth'
import { stamp } from '@/lib/airmail-db'
import { limited } from '@/lib/ratelimit'

// ponytail: счёт считает клиент, серверного античита нет — штамп только в свой паспорт и с пометкой AIRMAIL
export async function POST(req: Request) {
  const s = await auth.api.getSession({ headers: await headers() })
  if (!s) return new Response(null, { status: 401 })
  const body = await req.json().catch(() => null)
  const planeId = body?.planeId
  if (!Number.isInteger(planeId) || planeId <= 0 || planeId > 2 ** 31 - 1) return new Response('bad planeId', { status: 400 })
  if (await limited(`airmail:${s.user.id}`, 60, 3600)) return new Response(null, { status: 429 })
  return new Response(null, { status: (await stamp(s.user.id, planeId)) ? 204 : 409 })
}
