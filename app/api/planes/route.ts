import { after } from 'next/server'
import { collectIfDue } from '@/lib/collect'
import { pool } from '@/lib/db'

export async function GET(req: Request) {
  after(collectIfDue)
  const since = Number(new URL(req.url).searchParams.get('after')) || 0
  const { rows } = await pool.query(
    `select p.id, p.from_handle, p.to_handle, p.from_country, p.to_country, u.image as from_avatar
     from planes p
     left join account a on a."providerId" = 'twitter' and a."accountId" = p.from_x_id
     left join "user" u on u.id = a."userId"
     where p.id > $1 order by p.id desc limit 200`, [since])
  return Response.json(rows)
}
