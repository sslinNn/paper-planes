import { test } from 'node:test'
import assert from 'node:assert/strict'
import { clampTilt, flightAt, onFront } from './globe.ts'

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
