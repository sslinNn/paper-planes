import { test } from 'node:test'
import assert from 'node:assert/strict'
import { farthest, kmFlown, normalizeHandle, summary, summaryLine } from './pilot.ts'

test('normalizeHandle: strips @, decodes, rejects junk', () => {
  assert.equal(normalizeHandle('_sslinNn'), '_sslinNn')
  assert.equal(normalizeHandle('@_sslinNn'), '_sslinNn')
  assert.equal(normalizeHandle('%40_sslinNn'), '_sslinNn')
  assert.equal(normalizeHandle(''), null)
  assert.equal(normalizeHandle('a'.repeat(16)), null)
  assert.equal(normalizeHandle("x'; drop"), null)
  assert.equal(normalizeHandle('%E0%A4%A'), null)
})

test('summary: Antarctica is not a country, planes add up, earliest first', () => {
  const s = summary([
    { country: 'US', count: 3, first: '2026-03-02T00:00:00Z' },
    { country: 'AQ', count: 2, first: '2026-01-05T00:00:00Z' },
    { country: 'JP', count: 1, first: '2026-04-01T00:00:00Z' },
  ])
  assert.deepEqual(s, { countries: 2, planes: 6, since: '2026-01-05T00:00:00Z' })
  assert.equal(summaryLine(s), '2 countries · 6 planes')
  assert.equal(summaryLine(summary([{ country: 'FR', count: 1, first: 'x' }])), '1 country · 1 plane')
  assert.deepEqual(summary([]), { countries: 0, planes: 0, since: null })
})

test('kmFlown: distance × planes from home, Antarctica and no home count as zero', () => {
  const stamps = [{ country: 'JP', count: 2, first: 'x' }, { country: 'AQ', count: 5, first: 'x' }, { country: 'DE', count: 1, first: 'x' }]
  const one = kmFlown('DE', [{ country: 'JP', count: 1, first: 'x' }])
  assert.ok(one > 8000 && one < 10000, `DE→JP ≈ 9000 km, got ${one}`)
  assert.equal(kmFlown('DE', stamps), 2 * one)
  assert.equal(kmFlown(null, stamps), 0)
  assert.equal(kmFlown('AQ', stamps), 0)
})

test('farthest: the most distant country from home, ignoring home and Antarctica', () => {
  const st = (country: string) => ({ country, count: 1, first: 'x' })
  assert.equal(farthest('RU', [st('GB'), st('US'), st('AQ'), st('RU')])?.country, 'US')
  assert.ok(farthest('RU', [st('GB')])!.km > 1000)
  assert.equal(farthest(null, [st('GB')]), null)
  assert.equal(farthest('RU', [st('AQ'), st('RU')]), null)
})
