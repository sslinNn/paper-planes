import { test } from 'node:test'
import assert from 'node:assert/strict'
import { board, flag, placeName } from './traffic.ts'
import type { PlaneRow } from './sky.ts'

const NOW = Date.parse('2026-09-29T12:00:00Z')
let id = 0
const plane = (from: string | null, to: string | null, hoursAgo: number, handle = 'a'): PlaneRow => ({
  id: ++id, from_handle: handle, to_handle: 'z', from_country: from, to_country: to,
  created_at: new Date(NOW - hoursAgo * 3_600_000).toISOString(),
})

test('board: routes and skies ranked, landing of the day is the last 24h only and never unknown', () => {
  const planes = [
    plane('RU', 'US', 1), plane('RU', 'US', 2, 'b'), plane('RU', 'US', 50),
    plane('IN', 'BR', 3), plane('IN', 'BR', 4),
    plane('FR', null, 1), plane('FR', null, 1), plane('FR', null, 1),
    plane('DE', 'JP', 48), plane('DE', 'JP', 49), plane('DE', 'JP', 50), plane('DE', 'JP', 51),
  ]
  const b = board(planes, (p) => (p.to_country === 'BR' ? 14000 : 7000), NOW)
  assert.equal(b.planes, 12)
  assert.deepEqual(b.routes[0], { key: 'DE>JP', count: 4, pilots: 1 })
  assert.deepEqual(b.routes[1], { key: 'RU>US', count: 3, pilots: 2 })
  assert.equal(b.skies[0].total, 4)
  assert.ok(!b.routes.some((r) => r.key.includes('AQ')) && !b.skies.some((s) => s.iso === 'AQ'), 'unknown stays off the board')
  // JP получил 4, но двое суток назад; AQ получил 3 за час, но это «неизвестно»
  assert.deepEqual(b.landingOfDay, { iso: 'US', count: 2 })
  assert.equal(b.longest?.km, 14000)
})

test('board: empty sky', () => {
  const b = board([], () => 0, NOW)
  assert.deepEqual(b, { planes: 0, routes: [], skies: [], landingOfDay: null, longest: null })
})

test('placeName: Antarctica reads as unknown', () => {
  assert.equal(placeName('AQ'), 'Somewhere unknown')
  assert.equal(placeName('RU'), 'Russia')
})

test('flag: regional indicators, fog for unknown', () => {
  assert.equal(flag('BR'), '🇧🇷')
  assert.equal(flag('AQ'), '🌫️')
})
