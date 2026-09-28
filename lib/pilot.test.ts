import { test } from 'node:test'
import assert from 'node:assert/strict'
import { normalizeHandle, summary, summaryLine } from './pilot.ts'

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
