import { test } from 'node:test'
import assert from 'node:assert/strict'
import { greeting, stampDesign } from './stamps.ts'

test('greeting: local hello, English fallback', () => {
  assert.equal(greeting('RU'), 'ПРИВЕТ')
  assert.equal(greeting('AU'), "G'DAY")
  assert.equal(greeting('JP'), 'こんにちは')
  assert.equal(greeting('ZZ'), 'HELLO')
})

test('stampDesign: deterministic per country, varied across countries', () => {
  assert.deepEqual(stampDesign('RU'), stampDesign('RU'))
  const codes = ['RU', 'GB', 'SE', 'CA', 'US', 'FR', 'DE', 'JP', 'BR', 'IN', 'AU', 'KE']
  const shapes = new Set(codes.map((c) => stampDesign(c).shape))
  const motifs = new Set(codes.map((c) => stampDesign(c).motif))
  assert.ok(shapes.size >= 4, `shapes ${[...shapes]}`)
  assert.ok(motifs.size >= 4, `motifs ${[...motifs]}`)
  for (const c of codes) {
    const d = stampDesign(c)
    assert.ok(d.tilt >= -9 && d.tilt <= 9)
  }
})

test('Antarctica gets its own snowy stamp', () => {
  assert.equal(stampDesign('AQ').motif, 'snow')
  assert.equal(greeting('AQ'), 'PENGUINS SAY HI')
})
