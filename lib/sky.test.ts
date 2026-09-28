import { test } from 'node:test'
import assert from 'node:assert/strict'
import { flightLog, summarize, UNKNOWN } from './sky.ts'

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

test('routes: one entry per country pair, latest plane leads, busiest first', async () => {
  const { routes } = await import('./sky.ts')
  const r = routes([p('a', 'RU', 'x', 'GB'), p('b', 'RU', 'y', 'GB'), p('a', 'RU', 'z', null), p('a', 'RU', 'q', 'GB')])
  assert.equal(r.length, 2)
  assert.equal(r[0].key, 'RU>GB')
  assert.equal(r[0].count, 3)
  assert.equal(r[0].lead.from_handle, 'a') // первый в выдаче = самый свежий
  assert.deepEqual(r[0].senders, ['a', 'b'])
  assert.equal(r[1].key, 'RU>AQ')
})

test('sky traffic: one plane per route in the air, capped overall', async () => {
  const { Traffic } = await import('./sky.ts')
  const t = new Traffic(2)
  assert.equal(t.takeoff('RU>GB', 1000, 0), true)
  assert.equal(t.takeoff('RU>GB', 1000, 500), false) // маршрут занят
  assert.equal(t.takeoff('RU>US', 1000, 500), true)
  assert.equal(t.takeoff('DE>FR', 1000, 600), false) // небо полное
  assert.equal(t.takeoff('RU>GB', 1000, 1200), true) // первый приземлился
})

test('userHue: stable per handle, case-insensitive, never in the map-blue band', async () => {
  const { userHue } = await import('./sky.ts')
  assert.equal(userHue('_sslinNn'), userHue('_SSLINNN'))
  const hues = ['alice', 'bob', 'carl', 'dan', 'eve', 'fay', 'tibo_maker', 'moonfarm_dev'].map(userHue)
  assert.ok(new Set(hues).size >= 7, `hues: ${hues}`)
  for (const h of hues) assert.ok(h >= 0 && h < 360 && !(h >= 200 && h < 260), `hue ${h}`)
})

test('timeAgo: short human intervals', async () => {
  const { timeAgo } = await import('./sky.ts')
  const now = Date.parse('2026-09-28T12:00:00Z')
  assert.equal(timeAgo('2026-09-28T11:59:40Z', now), 'just now')
  assert.equal(timeAgo('2026-09-28T11:58:00Z', now), '2 min ago')
  assert.equal(timeAgo('2026-09-28T09:00:00Z', now), '3 h ago')
  assert.equal(timeAgo('2026-09-25T12:00:00Z', now), '3 d ago')
})

test('flight log skips unknown countries in distance and finds the top pilot and route', () => {
  const km = (x: { from_country: string | null }) => (x.from_country === 'RU' ? 100 : 10)
  const log = flightLog([p('a', 'RU', 'x', 'US'), p('a', 'RU', 'y', 'US'), p('b', 'DE', 'z', 'GB'), p('c', null, 'a', 'RU')], km)
  assert.equal(log.km, 210)
  assert.equal(log.longest?.km, 100)
  assert.deepEqual(log.pilot, { handle: 'a', count: 2 })
  assert.equal(log.route?.key, 'RU>US')
  assert.equal(flightLog([p('a', 'RU', 'b', 'US')], km).route, null)
})
