import { after } from 'next/server'
import { collectIfDue } from '@/lib/collect'
import { planeRows } from '@/lib/pilot-db'

export async function GET(req: Request) {
  after(collectIfDue)
  // id — int4: мусор и числа больше 2^31 не должны ронять запрос
  const since = Math.min(Math.max(Math.trunc(Number(new URL(req.url).searchParams.get('after'))) || 0, 0), 2 ** 31 - 1)
  const rows = await planeRows('p.id > $1', [since])
  // CDN держит ответ 10 с: в наплыв все зрители делят один запрос в БД, а не бьют её каждые 20 с
  return Response.json(rows, { headers: { 'Cache-Control': 'public, s-maxage=10, stale-while-revalidate=30' } })
}
