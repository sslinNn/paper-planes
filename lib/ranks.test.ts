import { test } from 'node:test'
import assert from 'node:assert/strict'
import { maxScore, nextRank, rankOf, runFits, runRequest, unlocked } from './ranks.ts'

test('rank thresholds', () => {
  assert.equal(rankOf(0).name, 'Cadet')
  assert.equal(rankOf(9).name, 'Cadet')
  assert.equal(rankOf(10).name, 'Courier')
  assert.equal(rankOf(30).plane, 'swallow')
  assert.equal(rankOf(999).name, 'Ace')
  assert.equal(nextRank(14)?.name, 'Captain')
  assert.equal(nextRank(60), null)
})

test('models unlock only by rank', () => {
  assert.equal(unlocked(0, 'dart'), true)
  assert.equal(unlocked(9, 'glider'), false)
  assert.equal(unlocked(10, 'glider'), true)
  assert.equal(unlocked(59, 'crane'), false)
})

test('maxScore grows with letters and caps impossible scores', () => {
  assert.ok(maxScore(0) < maxScore(5))
  assert.ok(maxScore(12) < 300000)
})

test('runRequest validates a finished run', () => {
  const ok = { day: 5, mode: 'daily', score: 4200, delivered: 4, km: 9000, countries: ['JP', 'BR', 'DE', 'DE'] }
  assert.deepEqual(runRequest(ok, 5), ok)
  assert.deepEqual(runRequest({ ...ok, day: 4 }, 5), { ...ok, day: 4 }, 'run that started before midnight')
  assert.equal(runRequest({ ...ok, day: 3 }, 5), null)
  assert.equal(runRequest({ ...ok, mode: 'god' }, 5), null)
  assert.deepEqual(runRequest({ ...ok, mode: 'free' }, 5), { ...ok, mode: 'free' })
  assert.equal(runRequest({ ...ok, score: maxScore(4) + 1 }, 5), null)
  assert.equal(runRequest({ ...ok, delivered: 201 }, 5), null)
  assert.equal(runRequest({ ...ok, score: -1 }, 5), null)
  assert.equal(runRequest({ ...ok, countries: ['<b>'] }, 5), null)
  assert.equal(runRequest({ ...ok, countries: ['JP'] }, 5), null, 'countries must match delivered')
  assert.equal(runRequest(null, 5), null)
})

test('runFits: a score needs the wall-clock time its letters and kilometres take', () => {
  const t0 = 5_000_000
  assert.equal(runFits(t0, t0 + 1000, { delivered: 5, km: 100 }), false, '5 letters in a second')
  assert.equal(runFits(t0, t0 + 60_000, { delivered: 5, km: 20_000 }), true)
  assert.equal(runFits(t0, t0 + 20_000, { delivered: 2, km: 400_000 }), false, 'faster than any plane')
})
