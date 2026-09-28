import type { Tweet, XUser } from './planes.ts'

export class RateLimited extends Error {}
export class Unauthorized extends Error {}

const API = 'https://api.x.com/2'

// X API — оплата за каждый вернувшийся ресурс. Считаем по самому дорогому тарифу (пост $0.005, юзер $0.010):
// реальный счёт ниже — свои посты идут как owned reads по $0.001, повтор за сутки UTC не списывается
export const X_DAILY_USD = 1
export const xCost = (tweets: number, users: number) => tweets * 0.005 + users * 0.01

async function get<T>(url: string, token: string, f: typeof fetch): Promise<T> {
  const r = await f(url, { headers: { Authorization: `Bearer ${token}` } })
  if (r.status === 429) throw new RateLimited()
  if (r.status === 401 || r.status === 403) throw new Unauthorized()
  if (!r.ok) throw new Error(`X ${r.status}: ${await r.text()}`)
  return r.json()
}

// ponytail: до 3 страниц (300 постов) за прогон; больше — хвост старее теряется (since_id уходит вперёд)
const MAX_PAGES = 3

export async function getTweets(token: string, userId: string, sinceId: string | null, f: typeof fetch = fetch) {
  const q = new URLSearchParams({
    max_results: sinceId ? '100' : '20',
    'tweet.fields': 'in_reply_to_user_id,created_at',
    expansions: 'in_reply_to_user_id',
    'user.fields': 'username,location',
  })
  if (sinceId) q.set('since_id', sinceId)
  const tweets: Tweet[] = []
  const users = new Map<string, XUser>()
  let newestId = sinceId
  let next: string | undefined
  for (let page = 0; page < MAX_PAGES; page++) {
    if (next) q.set('pagination_token', next)
    const j = await get<{ data?: Tweet[]; includes?: { users?: XUser[] }; meta?: { newest_id?: string; next_token?: string } }>(
      `${API}/users/${userId}/tweets?${q}`, token, f,
    )
    tweets.push(...(j.data ?? []))
    for (const u of j.includes?.users ?? []) users.set(u.id, u)
    if (!page) newestId = j.meta?.newest_id ?? sinceId
    next = sinceId ? j.meta?.next_token : undefined // первый запуск — только последние 20, без хвоста
    if (!next) break
  }
  return { tweets, users: [...users.values()], newestId }
}

export async function getMe(token: string, f: typeof fetch = fetch) {
  const j = await get<{ data: { username: string; location?: string } }>(
    `${API}/users/me?user.fields=username,location`, token, f,
  )
  return j.data
}
