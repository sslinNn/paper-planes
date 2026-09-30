import { board } from '@/lib/airmail-db'
import { dayNumber } from '@/lib/postcard'

// топ-20 «Today's Mail» — общий для всех, CDN держит 15 секунд
export async function GET() {
  const day = dayNumber()
  return Response.json({ day, rows: await board(day) }, { headers: { 'Cache-Control': 'public, s-maxage=15, stale-while-revalidate=30' } })
}
