import { test } from 'node:test'
import assert from 'node:assert/strict'
import { clampTilt, flightAt, onFront, replayKind, replayPool } from './globe.ts'

test('flightAt walks the great circle from a to b', () => {
  const a: [number, number] = [37.6, 55.7], b: [number, number] = [-74, 40.7]
  assert.deepEqual(flightAt(a, b, 0).map((v) => Math.round(v * 10) / 10), [37.6, 55.7])
  const end = flightAt(a, b, 1)
  assert.ok(Math.abs(end[0] + 74) < 1e-6 && Math.abs(end[1] - 40.7) < 1e-6)
  const mid = flightAt(a, b, 0.5)
  assert.ok(mid[1] > 60, `the Moscow–New York great circle bends north (lat ${mid[1].toFixed(1)})`)
})

test('onFront: the side of the globe facing the camera', () => {
  assert.equal(onFront([10, 50], [0, 45]), true)
  assert.equal(onFront([180, -45], [0, 45]), false)
})

test('clampTilt keeps the camera off the poles', () => {
  assert.equal(clampTilt(80), 60)
  assert.equal(clampTilt(-90), -60)
  assert.equal(clampTilt(12), 12)
})

test('replayPool skips flights into the fog while real routes exist', () => {
  const p = (id: number, from: string | null, to: string | null) => ({ id, from_country: from, to_country: to })
  const planes = [p(1, 'RU', null), p(2, 'IN', 'AQ'), p(3, 'RU', 'GB'), p(4, null, 'US'), p(5, 'IN', 'US')]
  assert.deepEqual(replayPool(planes).map((x) => x.id), [3, 5])
  assert.deepEqual(replayPool([p(1, 'RU', null), p(2, 'IN', 'AQ')]).map((x) => x.id), [1, 2], 'only fog left: still fly something')
  assert.deepEqual(replayPool(planes, 3).map((x) => x.id), [3], 'only the recent window')
})

test('replayKind mixes Mail Wars deliveries into the replay', () => {
  assert.equal(replayKind(0, 0, 0), null)
  assert.deepEqual([0, 1, 2, 3, 4, 5].map((t) => replayKind(t, 10, 4)), ['plane', 'plane', 'delivery', 'plane', 'plane', 'delivery'])
  assert.equal(replayKind(0, 10, 0), 'plane')
  assert.equal(replayKind(0, 0, 3), 'delivery', 'no logged-in pilots: the game keeps the globe alive')
})
