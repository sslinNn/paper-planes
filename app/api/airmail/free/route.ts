import { freeBag } from '@/lib/airmail-db'

// свободный полёт: общий набор свежих писем, клиент тасует его сам — CDN держит минуту
export async function GET() {
  return Response.json(await freeBag(), { headers: { 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=120' } })
}
