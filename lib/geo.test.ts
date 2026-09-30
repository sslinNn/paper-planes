import { test } from 'node:test'
import assert from 'node:assert/strict'
import { geoContains } from 'd3-geo'
import { at, FOG, inCountry, isoOf, land } from './geo.ts'

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
  assert.ok(FOG[1] <= -60)
})

test('Antarctica code is the same point as unknown', () => {
  assert.equal(at('AQ'), FOG)
})

test('Chukotka stays with Russia: the seam runs through the Bering Strait', async () => {
  const { projection, W } = await import('./geo.ts')
  const chukotka = projection([-172, 66])![0] // восточная Чукотка
  const alaska = projection([-165, 65])![0] // западная Аляска
  assert.ok(chukotka > W * 0.95, `chukotka x=${chukotka}`)
  assert.ok(alaska < W * 0.05, `alaska x=${alaska}`)
})

test('spot inside its country only', () => {
  assert.ok(inCountry('RU', [37.6, 55.75])) // Москва
  assert.ok(!inCountry('RU', [2.35, 48.85])) // Париж
  assert.ok(!inCountry('XX', [37.6, 55.75]))
})

test('Crimea is neutral: land, but neither Russia nor Ukraine', () => {
  const simferopol: [number, number] = [34.1, 44.95]
  const here = land.filter((f) => geoContains(f, simferopol))
  assert.equal(here.length, 1)
  assert.equal(isoOf(here[0]), null)
  assert.ok(!inCountry('RU', simferopol) && !inCountry('UA', simferopol))
  assert.ok(inCountry('RU', [37.62, 55.75]) && inCountry('UA', [30.52, 50.45]))
})
