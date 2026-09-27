import type { Tweet, XUser } from './planes.ts'

export class RateLimited extends Error {}
export class Unauthorized extends Error {}

const API = 'https://api.x.com/2'

async function get<T>(url: string, token: string, f: typeof fetch): Promise<T> {
  const r = await f(url, { headers: { Authorization: `Bearer ${token}` } })
  if (r.status === 429) throw new RateLimited()
  if (r.status === 401 || r.status === 403) throw new Unauthorized()
  if (!r.ok) throw new Error(`X ${r.status}: ${await r.text()}`)
  return r.json()
}

export async function getTweets(token: string, userId: string, sinceId: string | null, f: typeof fetch = fetch) {
  const q = new URLSearchParams({
    max_results: sinceId ? '100' : '20',
    'tweet.fields': 'in_reply_to_user_id,created_at',
    expansions: 'in_reply_to_user_id',
    'user.fields': 'username,location',
  })
  if (sinceId) q.set('since_id', sinceId)
  const j = await get<{ data?: Tweet[]; includes?: { users?: XUser[] }; meta?: { newest_id?: string } }>(
    `${API}/users/${userId}/tweets?${q}`, token, f,
  )
  return { tweets: j.data ?? [], users: j.includes?.users ?? [], newestId: j.meta?.newest_id ?? sinceId }
}

export async function getMe(token: string, f: typeof fetch = fetch) {
  const j = await get<{ data: { username: string; location?: string } }>(
    `${API}/users/me?user.fields=username,location`, token, f,
  )
  return j.data
}
