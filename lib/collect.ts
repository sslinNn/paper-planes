import { auth } from './auth.ts'
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
  // Better Auth сам обновит протухший токен
  const { accessToken } = await auth.api.getAccessToken({ body: { accountId: r.account_id, userId: r.user_id } })
  const me: Me = { x_id: r.x_id, handle: r.handle, country: r.country }

  if (!r.since_id && !r.country && !r.country_manual) {
    me.country = parseCountry((await getMe(accessToken)).location)
    await pool.query(`update "user" set country = $1 where id = $2`, [me.country, r.user_id])
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
     where a."refreshToken" is not null and ($1::text is null or u.id = $1)`, [userId ?? null])

  // ponytail: юзеры по очереди в одном вызове; упрёмся в лимит времени функции (300 с) — батчить курсором
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
  if (rowCount) await collect()
}
