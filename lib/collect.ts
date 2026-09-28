import { auth } from './auth.ts'
import { syncDonations } from './donations.ts'
import { parseCountry } from './country.ts'
import { pool } from './db.ts'
import { type Me, replyTargets, resolveCountries, toPlanes } from './planes.ts'
import { getMe, getTweets, RateLimited } from './x.ts'

type Row = {
  user_id: string; account_id: string; x_id: string; handle: string
  country: string | null; country_manual: boolean | null; since_id: string | null
}

const toMap = (rows: { x_id: string; country: string | null }[]) => new Map(rows.map((r) => [r.x_id, r.country]))

async function collectUser(r: Row): Promise<number> {
  // один сбор на юзера раз в 4 минуты — иначе GET /api/me можно крутить в цикле за наш счёт
  const claim = await pool.query(
    `update "user" set "collectedAt" = now()
     where id = $1 and ("collectedAt" is null or "collectedAt" < now() - interval '4 minutes')`, [r.user_id])
  if (!claim.rowCount) return 0

  // Better Auth сам обновит протухший токен
  const { accessToken } = await auth.api.getAccessToken({ body: { accountId: r.account_id, userId: r.user_id } })
  const me: Me = { x_id: r.x_id, handle: r.handle, country: r.country }

  // Better Auth не сохраняет поля с input: false из профиля — хэндл берём сами
  if (!r.handle || (!r.since_id && !r.country && !r.country_manual)) {
    const profile = await getMe(accessToken)
    me.handle = profile.username
    // страну мог выбрать сам юзер, пока мы ждали X — ручной выбор не трогаем
    const { rows } = await pool.query(
      `update "user" set handle = $1,
         country = case when "countryManual" or country is not null then country else $2 end
       where id = $3 returning country`, [me.handle, parseCountry(profile.location), r.user_id])
    me.country = rows[0].country
  }

  const { tweets, users, newestId } = await getTweets(accessToken, r.x_id, r.since_id)
  const ids = replyTargets(me, tweets)
  let count = 0

  if (ids.length) {
    const registered = await pool.query(
      `select a."accountId" as x_id, u.country from account a join "user" u on u.id = a."userId"
       where a."providerId" = 'twitter' and a."accountId" = any($1)`, [ids])
    const cached = await pool.query(`select x_id, country from recipients where x_id = any($1)`, [ids])
    const { countryOf, newRecipients } = resolveCountries(ids, toMap(registered.rows), toMap(cached.rows), users)

    await pool.query(
      `insert into recipients (x_id, handle, country)
       select x_id, handle, country from json_populate_recordset(null::recipients, $1::json)
       on conflict (x_id) do nothing`, [JSON.stringify(newRecipients)])

    const planes = toPlanes(me, tweets, users, countryOf)
    const res = await pool.query(
      `insert into planes (tweet_id, from_x_id, to_x_id, from_handle, to_handle, from_country, to_country, created_at)
       select tweet_id, from_x_id, to_x_id, from_handle, to_handle, from_country, to_country, created_at
       from json_populate_recordset(null::planes, $1::json)
       on conflict (tweet_id) do nothing`, [JSON.stringify(planes)])
    count = res.rowCount ?? 0
  }

  // since_id двигаем строго после вставки самолётиков — иначе потеряем их
  if (newestId !== r.since_id) await pool.query(`update "user" set "sinceId" = $1 where id = $2`, [newestId, r.user_id])
  return count
}

export async function collect(userId?: string): Promise<number> {
  const { rows } = await pool.query<Row>(
    `select u.id as user_id, a.id as account_id, a."accountId" as x_id, u.handle, u.country,
            u."countryManual" as country_manual, u."sinceId" as since_id
     from "user" u join account a on a."userId" = u.id and a."providerId" = 'twitter'
     where a."refreshToken" is not null and ($1::text is null or u.id = $1)
     order by u."collectedAt" asc nulls first limit 40`, [userId ?? null])

  // по кругу: за прогон — 40 самых давно собранных, так укладываемся в лимит функции (300 с) и в бюджет X API.
  // ponytail: при 40 за 5 мин юзер обновляется раз в (юзеров / 8) мин; больше юзеров — cron и батчи побольше
  let planes = 0
  for (const r of rows) {
    try {
      planes += await collectUser(r)
    } catch (e) {
      if (e instanceof RateLimited) break
      console.error(`collect @${r.handle}:`, e) // мёртвый токен и прочее: пропускаем, остальные собираются
    }
  }
  return planes
}

export async function collectIfDue(): Promise<void> {
  const { rowCount } = await pool.query(
    `update collector set last_run = now() where last_run < now() - interval '5 minutes'`)
  if (rowCount) await Promise.all([collect(), syncDonations().catch((e) => console.error('lava sync', e))])
}
