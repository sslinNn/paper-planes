import { test } from 'node:test'
import assert from 'node:assert/strict'
import { at, FOG } from './geo.ts'

test('known country → finite centroid in the right hemisphere', () => {
  const [lon, lat] = at('BR')
  assert.ok(Number.isFinite(lon) && Number.isFinite(lat))
  assert.ok(lon < -30 && lat < 5)
})

test('null, unknown code and country without 110m geometry → fog', () => {
  assert.equal(at(null), FOG)
  assert.equal(at('XX'), FOG)
  assert.equal(at('SG'), FOG)
})

test('unknown country lands in Antarctica', () => {
  assert.ok(FOG[1] <= -70)
})

test('Antarctica code is the same point as unknown', () => {
  assert.equal(at('AQ'), FOG)
})
