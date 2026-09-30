import { headers } from 'next/headers'
import { auth } from '@/lib/auth'
import { saveRun } from '@/lib/airmail-db'
import { dayNumber } from '@/lib/postcard'
import { rankOf, runRequest } from '@/lib/ranks'
import { limited } from '@/lib/ratelimit'

// конец забега залогиненного: опыт (ранг) и место в лидерборде дня
export async function POST(req: Request) {
  const s = await auth.api.getSession({ headers: await headers() })
  if (!s) return new Response(null, { status: 401 })
  const run = runRequest(await req.json().catch(() => null), dayNumber())
  if (!run) return new Response('bad run', { status: 400 })
  if (await limited(`run:${s.user.id}`, 30, 3600)) return new Response(null, { status: 429 })
  const { xp, place } = await saveRun(s.user.id, run)
  return Response.json({ xp, rank: rankOf(xp).name, place })
}
