import { test } from 'node:test'
import assert from 'node:assert/strict'
import { claimRequest, empires, inkOf, INKS, rulers, worldEvent } from './wars.ts'

test('rulers: most deliveries wins, ties go alphabetical', () => {
  const r = rulers([
    { nation: 'US', country: 'IN', n: 2 }, { nation: 'RU', country: 'IN', n: 1 }, { nation: 'RU', country: 'IN', n: 2 },
    { nation: 'DE', country: 'FR', n: 1 }, { nation: 'BR', country: 'FR', n: 1 },
  ])
  assert.deepEqual(r.get('IN'), { nation: 'RU', n: 3 })
  assert.deepEqual(r.get('FR'), { nation: 'BR', n: 1 })
  assert.deepEqual(empires(r), [{ nation: 'BR', countries: 1 }, { nation: 'RU', countries: 1 }])
})

test('claimRequest validates and counts', () => {
  assert.deepEqual(claimRequest({ nation: 'RU', countries: ['IN', 'IN', 'us', 'AQ', 'FR'] }), { nation: 'RU', claims: [['IN', 2], ['FR', 1]] })
  assert.equal(claimRequest({ nation: 'xx', countries: ['IN'] }), null)
  assert.equal(claimRequest({ nation: 'RU', countries: ['AQ'] }), null)
  assert.equal(claimRequest({ nation: 'RU', countries: Array(201).fill('IN') }), null)
  assert.equal(claimRequest(null), null)
})

test('worldEvent rotates through the top by hour and ends on the hour', () => {
  const rows = [{ country: 'US', n: 9, hot: 1 }, { country: 'IN', n: 5, hot: 0 }]
  const h = 3_600_000
  assert.equal(worldEvent(rows, 10 * h + 5)!.country, 'US')
  assert.equal(worldEvent(rows, 11 * h + 5)!.country, 'IN')
  assert.equal(worldEvent(rows, 11 * h + 5)!.until, 12 * h)
  assert.equal(worldEvent([], 0), null)
})

test('inkOf is stable and from the palette', () => {
  assert.equal(inkOf('RU'), inkOf('RU'))
  assert.ok(INKS.includes(inkOf('US')))
})
