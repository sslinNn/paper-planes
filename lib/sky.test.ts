import { test } from 'node:test'
import assert from 'node:assert/strict'
import { summarize, UNKNOWN } from './sky.ts'

const p = (from: string, fc: string | null, to: string, tc: string | null) =>
  ({ id: 0, from_handle: from, to_handle: to, from_country: fc, to_country: tc })

test('groups senders and destinations per origin country, busiest first', () => {
  const sky = summarize([p('a', 'RU', 'x', 'US'), p('a', 'RU', 'y', 'US'), p('b', 'RU', 'z', 'GB'), p('c', 'DE', 'a', 'RU')])
  const ru = sky.get('RU')!
  assert.equal(ru.out, 3)
  assert.deepEqual(ru.people, [['a', 2], ['b', 1]])
  assert.deepEqual(ru.destinations, [['US', 2], ['GB', 1]])
  assert.equal(ru.in, 1)
})

test('unknown countries land in Antarctica', () => {
  const sky = summarize([p('a', null, 'b', null)])
  assert.equal(sky.get(UNKNOWN)!.out, 1)
  assert.equal(sky.get(UNKNOWN)!.in, 1)
  assert.deepEqual(sky.get(UNKNOWN)!.destinations, [[UNKNOWN, 1]])
})

test('a country that only receives planes still shows up', () => {
  const sky = summarize([p('a', 'RU', 'b', 'JP')])
  assert.deepEqual(sky.get('JP'), { out: 0, in: 1, people: [], destinations: [] })
})
