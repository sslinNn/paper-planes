import { dailyBag } from '@/lib/airmail-db'

// «Today's Mail»: один мешок на всех на день — CDN держит его долго, в БД ходим редко
export async function GET() {
  return Response.json(await dailyBag(), { headers: { 'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600' } })
}
