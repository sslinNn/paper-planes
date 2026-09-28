import { test } from 'node:test'
import assert from 'node:assert/strict'
import { getMe, getTweets, RateLimited, Unauthorized, X_DAILY_USD, xCost } from './x.ts'

const fake = (status: number, body: unknown, seen: string[] = []) =>
  ((url: string | URL | Request) => {
    seen.push(String(url))
    return Promise.resolve(new Response(JSON.stringify(body), { status }))
  }) as typeof fetch

test('getTweets first run: 20 tweets, no since_id', async () => {
  const seen: string[] = []
  const r = await getTweets('tok', '1', null, fake(200, { meta: { result_count: 0 } }, seen))
  const url = new URL(seen[0])
  assert.equal(url.pathname, '/2/users/1/tweets')
  assert.equal(url.searchParams.get('max_results'), '20')
  assert.equal(url.searchParams.has('since_id'), false)
  assert.deepEqual(r, { tweets: [], users: [], newestId: null })
})

test('getTweets with since_id: 100 tweets, parses includes and newest id', async () => {
  const seen: string[] = []
  const body = {
    data: [{ id: '10', created_at: 'x', in_reply_to_user_id: '2' }],
    includes: { users: [{ id: '2', username: 'bob' }] },
    meta: { newest_id: '10' },
  }
  const r = await getTweets('tok', '1', '5', fake(200, body, seen))
  const url = new URL(seen[0])
  assert.equal(url.searchParams.get('max_results'), '100')
  assert.equal(url.searchParams.get('since_id'), '5')
  assert.equal(r.newestId, '10')
  assert.equal(r.users[0].username, 'bob')
})

test('getTweets: no new tweets keeps old since_id', async () => {
  const r = await getTweets('tok', '1', '5', fake(200, { meta: { result_count: 0 } }))
  assert.equal(r.newestId, '5')
})

test('getTweets follows next_token, merges pages, newest id from the first page', async () => {
  const seen: string[] = []
  const pages = [
    { data: [{ id: '20' }], includes: { users: [{ id: '2', username: 'a' }] }, meta: { newest_id: '20', next_token: 'n1' } },
    { data: [{ id: '10' }], includes: { users: [{ id: '2', username: 'a' }, { id: '3', username: 'b' }] }, meta: { newest_id: '10' } },
  ]
  const f = ((url: string) => (seen.push(String(url)), Promise.resolve(new Response(JSON.stringify(pages[seen.length - 1]))))) as unknown as typeof fetch
  const r = await getTweets('tok', '1', '5', f)
  assert.equal(new URL(seen[1]).searchParams.get('pagination_token'), 'n1')
  assert.equal(r.tweets.length, 2)
  assert.equal(r.users.length, 2)
  assert.equal(r.newestId, '20')
})

test('429 → RateLimited', async () => {
  await assert.rejects(() => getTweets('tok', '1', null, fake(429, {})), RateLimited)
})

test('401 → Unauthorized', async () => {
  await assert.rejects(() => getTweets('tok', '1', null, fake(401, {})), Unauthorized)
})

test('getMe asks for username and location', async () => {
  const seen: string[] = []
  const me = await getMe('tok', fake(200, { data: { id: '1', username: 'me', location: 'Berlin' } }, seen))
  assert.equal(new URL(seen[0]).searchParams.get('user.fields'), 'username,location')
  assert.equal(me.username, 'me')
})

test('xCost: worst-case price; a full first run fits the daily budget many times', () => {
  assert.ok(Math.abs(xCost(20, 20) - 0.3) < 1e-9)
  assert.ok(Math.abs(xCost(0, 1) - 0.01) < 1e-9)
  assert.ok(xCost(20, 20) * 3 <= X_DAILY_USD)
})
