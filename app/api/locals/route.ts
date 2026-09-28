import { pool } from '@/lib/db'

// залогиненные пилоты с известной страной — толпа аватарок на карте
export async function GET() {
  const { rows } = await pool.query(
    `select u.handle, u.country, u.image,
            case when u.spot_lon is not null then json_build_array(u.spot_lon, u.spot_lat) end as spot,
            exists (select 1 from patrons pt where pt.user_id = u.id) as patron
     from "user" u where u.country is not null and u.handle is not null
     order by u."createdAt" desc limit 500`)
  // состав толпы меняется редко: CDN держит минуту
  return Response.json(rows, { headers: { 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300' } })
}
