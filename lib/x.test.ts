import { test } from 'node:test'
import assert from 'node:assert/strict'
import { getTweets, RateLimited, Unauthorized } from './x.ts'

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

test('429 → RateLimited', async () => {
  await assert.rejects(() => getTweets('tok', '1', null, fake(429, {})), RateLimited)
})

test('401 → Unauthorized', async () => {
  await assert.rejects(() => getTweets('tok', '1', null, fake(401, {})), Unauthorized)
})
