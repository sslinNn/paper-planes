import { pool } from '@/lib/db'

// во что обходится небо: X API платный, оценка сверху (x_spend). Показываем рядом с донатом — честно, на что идут деньги
export async function GET() {
  const { rows: [r] } = await pool.query(
    `select (select coalesce(sum(usd), 0)::float from x_spend where day >= date_trunc('month', current_date)) as usd,
            (select count(distinct user_id)::int from patrons where paid_at >= date_trunc('month', now())) as patrons`)
  return Response.json(
    { usd: Math.round(r.usd * 100) / 100, patrons: r.patrons as number },
    { headers: { 'Cache-Control': 'public, s-maxage=600, stale-while-revalidate=3600' } },
  )
}
