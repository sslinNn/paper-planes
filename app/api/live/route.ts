import { pool } from '@/lib/db'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// heartbeat вкладки раз в 30 с: отмечаем посетителя, отдаём «онлайн» (видели за 75 с) и «уникальных за сегодня» (UTC)
// ponytail: накрутить можно случайными uuid — для витринного счётчика терпимо; rate limit по IP, если начнут
export async function POST(req: Request) {
  const { id } = await req.json().catch(() => ({}))
  if (typeof id !== 'string' || !UUID.test(id)) return new Response(null, { status: 400 })
  await pool.query(
    `insert into visitors (id) values ($1) on conflict (day, id) do update set last_seen = now()`, [id])
  const { rows: [r] } = await pool.query(
    `select count(*) filter (where last_seen > now() - interval '75 seconds')::int as online, count(*)::int as today
     from visitors where day = current_date`)
  return Response.json(r)
}
