import { after } from 'next/server'
import { collectIfDue } from '@/lib/collect'
import { pool } from '@/lib/db'

export async function GET(req: Request) {
  after(collectIfDue)
  const since = Number(new URL(req.url).searchParams.get('after')) || 0
  const { rows } = await pool.query(
    `select id, from_handle, to_handle, from_country, to_country
     from planes where id > $1 order by id desc limit 200`, [since])
  return Response.json(rows)
}
