import { guestBag } from '@/lib/airmail-db'

// общий мешок гостей: публичные самолётики, CDN делит один ответ на всех
export async function GET() {
  return Response.json(await guestBag(), { headers: { 'Cache-Control': 'public, s-maxage=30, stale-while-revalidate=60' } })
}
