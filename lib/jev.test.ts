import { test } from 'node:test'
import assert from 'node:assert/strict'
import { cleanReply, foldLetters, jevRequest } from './jev.ts'

const fake = (status: number, body: unknown, seen: RequestInit[] = []) =>
  ((_url: string | URL | Request, init?: RequestInit) => {
    seen.push(init!)
    return Promise.resolve(new Response(JSON.stringify(body), { status }))
  }) as typeof fetch

test('cleanReply strips leading @mentions', () => {
  assert.equal(cleanReply('@bob @amy thanks a lot!'), 'thanks a lot!')
  assert.equal(cleanReply('hi @bob'), 'hi @bob')
})

test('jevRequest asks one choice per reply pointing at its path', () => {
  const r = jevRequest([{ id: '1', text: 'thanks' }, { id: '2', text: 'lol' }])
  assert.equal(r.model, 'jev-latest')
  assert.deepEqual(r.state, { replies: [{ text: 'thanks' }, { text: 'lol' }] })
  assert.match(r.questions.k1.instructions, /`replies\[1\]\.text`/)
  assert.deepEqual(Object.keys(r.questions.k0.criteria).sort(), ['hot', 'joke', 'plain', 'question', 'warm'])
})

test('foldLetters maps answers back to ids, drops unknown choices', async () => {
  const seen: RequestInit[] = []
  const body = { answers: { k0: { type: 'choice', choice: 'warm' }, k1: { type: 'choice', choice: 'nonsense' } } }
  const m = await foldLetters([{ id: 'a', text: '@x thanks' }, { id: 'b', text: 'hm' }], 'key', fake(200, body, seen))
  assert.deepEqual([...m], [['a', 'warm']])
  assert.equal((seen[0].headers as Record<string, string>).Authorization, 'Bearer key')
  assert.equal(JSON.parse(String(seen[0].body)).state.replies[0].text, 'thanks')
})

test('foldLetters: no key or API error → empty map, never throws', async () => {
  assert.equal((await foldLetters([{ id: 'a', text: 'x' }], '', fake(200, {}))).size, 0)
  assert.equal((await foldLetters([{ id: 'a', text: 'x' }], 'k', fake(500, {}))).size, 0)
})

test('foldLetters chunks by 20', async () => {
  const seen: RequestInit[] = []
  const replies = Array.from({ length: 45 }, (_, i) => ({ id: String(i), text: 't' }))
  await foldLetters(replies, 'k', fake(200, { answers: {} }, seen))
  assert.equal(seen.length, 3)
})
