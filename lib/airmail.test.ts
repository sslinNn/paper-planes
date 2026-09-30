import { test } from 'node:test'
import assert from 'node:assert/strict'
import { countryAt, delivered, newGame, select, shareText, step, tally, wind, wrapDx, type Letter } from './airmail.ts'
import { at, projection, W } from './geo.ts'

const L = (id: number, to_country: string | null, kind: Letter['kind'] = null, to_handle = `u${id}`): Letter =>
  ({ id, from_handle: 'me', to_handle, to_country, kind })
const still = { aim: null, turn: 0 }
const circle = { aim: null, turn: 1 } // кружит на месте — не долетит до цели
const rand = () => 0.5

test('wind: trade winds west, westerlies east, polar west', () => {
  assert.ok(wind(10) < 0)
  assert.ok(wind(-15) < 0)
  assert.ok(wind(45) > 0)
  assert.ok(wind(-50) > 0)
  assert.ok(wind(75) < 0)
})

test('wrapDx takes the short way across the seam', () => {
  assert.equal(wrapDx(10, W - 10), 20)
  assert.equal(wrapDx(100, 300), 200)
})

test('delivered: inside Germany yes, Paris no; tiny/unknown country by radius; AQ by latitude', () => {
  assert.equal(delivered([10.4, 51.1], 'DE'), true)
  assert.equal(delivered([2.35, 48.85], 'DE'), false)
  // Сингапура нет на карте 110m — как и на главной, он в «тумане»; доставка у его точки
  assert.equal(delivered(at('SG'), 'SG'), true)
  assert.equal(delivered([0, -70], null), true)
  assert.equal(delivered([0, -40], 'AQ'), false)
  assert.equal(countryAt([10.4, 51.1]), 'DE')
})

test('newGame targets the nearest letter and starts at full altitude', () => {
  const g = newGame([L(1, 'JP'), L(2, 'PL')], [], [10.4, 51.1])
  assert.equal(g.alt, 100)
  assert.equal(g.target, 2)
})

test('step: glides down, moves, wraps x', () => {
  const g = newGame([L(1, 'JP')], [], [10.4, 51.1])
  const y0 = g.y
  step(g, still, 1, rand)
  assert.ok(g.alt < 100 && g.alt > 90)
  g.x = W - 0.1
  g.heading = 0
  step(g, still, 0.1, rand)
  assert.ok(g.x < 5, `wrapped to ${g.x}`)
  assert.ok(Math.abs(g.y - y0) < 50)
})

test('warm letters sink slower than hot ones', () => {
  const warm = newGame([L(1, 'JP', 'warm')], [], [10.4, 51.1])
  const hot = newGame([L(1, 'JP', 'hot')], [], [10.4, 51.1])
  step(warm, still, 1, rand)
  step(hot, still, 1, rand)
  assert.ok(warm.alt > hot.alt)
})

test('delivery lifts, removes the letter, retargets; question lifts double', () => {
  const g = newGame([L(1, 'DE', 'question'), L(2, 'JP')], [], [10.4, 51.1])
  select(g, 1)
  g.alt = 10
  const ev = step(g, still, 0.01, rand)
  assert.equal(ev[0].type, 'delivered')
  assert.ok(g.alt > 65, `alt ${g.alt}`) // 10 + 30 × 2
  assert.deepEqual(g.letters.map((l) => l.id), [2])
  assert.equal(g.target, 2)
  assert.equal(g.delivered.length, 1)
})

test('altitude 0 crashes; last letter empties the bag', () => {
  const g = newGame([L(1, 'JP')], [], [10.4, 51.1])
  g.alt = 0.01
  assert.equal(step(g, still, 1, rand).at(-1)?.type, 'crashed')
  assert.equal(g.done, true)
  const h = newGame([L(1, 'DE')], [], [10.4, 51.1])
  assert.deepEqual(step(h, still, 0.01, rand).map((e) => e.type), ['delivered', 'emptied'])
})

test('thermal lifts until it is spent', () => {
  const g = newGame([L(1, 'JP')], [{ iso: 'DE', hot: 0, warm: 9, total: 10 }], [10.4, 51.1])
  g.alt = 50
  step(g, still, 0.5, rand)
  assert.ok(g.alt > 50, `alt ${g.alt}`)
  for (let i = 0; i < 40; i++) step(g, still, 0.5, rand)
  assert.ok(g.thermals.every((t) => t.left <= 0 || Math.hypot(wrapDx(t.x, g.x), t.y - g.y) > t.r))
})

test('big dt after a background tab is clamped', () => {
  const g = newGame([L(1, 'JP')], [], [10.4, 51.1])
  step(g, still, 30, rand)
  assert.ok(g.alt > 50)
})

test('storms stay away during the calm start, then appear', () => {
  // шаг ограничен 0.05 с — крутим кадрами, держа высоту, чтобы не разбиться
  const g = newGame([L(1, 'AQ')], [{ iso: 'US', hot: 5, warm: 0, total: 5 }], [10.4, 51.1])
  for (let i = 0; i < 280; i++) { step(g, circle, 0.05, rand); g.alt = 100 } // 14 с
  assert.equal(g.storms.length, 0)
  for (let i = 0; i < 40; i++) { step(g, circle, 0.05, rand); g.alt = 100 } // ещё 2 с
  assert.ok(g.storms.length > 0)
})

test('shareText: logged-in mentions up to 3 unique recipients, guest none', () => {
  const d = [L(1, 'DE', 'hot', 'a'), L(2, 'FR', null, 'b'), L(3, 'JP', null, 'a'), L(4, 'US', null, 'c'), L(5, 'BR', null, 'd')]
  const s = shareText({ delivered: d, km: 12345, won: false, guest: false, me: 'me', bag: tally(d) })
  assert.match(s, /@a @b @c/)
  assert.doesNotMatch(s, /@d/)
  assert.match(s, /20% of my replies are hot takes/)
  const g = shareText({ delivered: d, km: 10, won: false, guest: true, me: null, bag: tally(d) })
  assert.doesNotMatch(g, /@/)
})

test('projection round trip used by the game', () => {
  const [x, y] = projection([10.4, 51.1])!
  const [lon, lat] = projection.invert!([x, y])!
  assert.ok(Math.abs(lon - 10.4) < 1e-6 && Math.abs(lat - 51.1) < 1e-6)
})
