import { test } from 'node:test'
import assert from 'node:assert/strict'
import { AIRFRAMES } from './airframes.ts'

// охват модели: корень из площади рамки её путей
const extent = (paths: string[]) => {
  const n = paths.join(' ').match(/-?[\d.]+/g)!.map(Number)
  const xs = n.filter((_, i) => i % 2 === 0), ys = n.filter((_, i) => i % 2 === 1)
  return Math.sqrt((Math.max(...xs) - Math.min(...xs)) * (Math.max(...ys) - Math.min(...ys)))
}

test('every airframe looks as big as the dart on screen (size normalizes the geometry)', () => {
  const dart = extent(AIRFRAMES.dart.wing) * AIRFRAMES.dart.size
  for (const [model, a] of Object.entries(AIRFRAMES)) {
    const k = (extent([...a.wing, ...a.fold]) * a.size) / dart
    assert.ok(k > 0.9 && k < 1.12, `${model} is ${k.toFixed(2)}× the dart`)
  }
})
