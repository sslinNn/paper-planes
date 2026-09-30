import { test } from 'node:test'
import assert from 'node:assert/strict'
import { dailyShare, dayNumber, flag, parseRoute, rng, routeCode } from './postcard.ts'

test('flag turns an ISO code into its emoji; unknown stays a globe', () => {
  assert.equal(flag('JP'), '🇯🇵')
  assert.equal(flag('AQ'), '🇦🇶')
  assert.equal(flag('x'), '🌐')
})

test('rng is deterministic per seed', () => {
  const a = rng(42), b = rng(42), c = rng(43)
  const sa = [a(), a(), a()], sb = [b(), b(), b()]
  assert.deepEqual(sa, sb)
  assert.notDeepEqual(sa, [c(), c(), c()])
  assert.ok(sa.every((x) => x >= 0 && x < 1))
})

test('dayNumber counts New York days from launch (Sep 30, 2026 = #1)', () => {
  assert.equal(dayNumber(new Date('2026-09-30T05:00:00Z')), 1) // 01:00 NY
  assert.equal(dayNumber(new Date('2026-10-01T03:59:00Z')), 1) // 23:59 NY
  assert.equal(dayNumber(new Date('2026-10-01T04:01:00Z')), 2)
})

test('route code round-trips and rejects junk', () => {
  const code = routeCode({ score: 42310.4, km: 18420.7, countries: ['JP', 'BR', 'DE'], day: 3 })
  assert.equal(code, '42310-18421-JPBRDE-3')
  assert.deepEqual(parseRoute(code), { score: 42310, km: 18421, countries: ['JP', 'BR', 'DE'], day: 3 })
  assert.deepEqual(parseRoute('10-20-'), { score: 10, km: 20, countries: [], day: null })
  assert.equal(parseRoute('<script>'), null)
  assert.equal(parseRoute('1-2-JPB'), null)
  assert.equal(parseRoute(`1-2-${'JP'.repeat(40)}`), null)
})

test('dailyShare is a spoiler-free Wordle-style line', () => {
  const s = dailyShare({ day: 1, countries: ['JP', 'BR', 'DE'], score: 42310, hot: 2, won: false })
  assert.equal(s, '✈️ Airmail #1 · 🇯🇵🇧🇷🇩🇪 · 🔥×2 · 42,310')
  assert.equal(dailyShare({ day: 2, countries: [], score: 0, hot: 0, won: false }), '✈️ Airmail #2 · 📭 · 0')
  assert.match(dailyShare({ day: 2, countries: ['US'], score: 5, hot: 0, won: true }), /🏁/)
})
